import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getSettings } from "../core/config";
import { getCodec, getDb } from "../core/database";
import { errorMessage, PolicyViolationError } from "../core/errors";
import { getLogger } from "../core/logger";
import { resolveFromCwd } from "../core/paths";
import { singleton } from "../core/singleton";
import { ExportStatus, toExportJob, type ExportJob } from "../models/entities";
import type { SearchRequest } from "../schemas/search";
import { auditService } from "./auditService";
import { chService } from "./clickhouseClient";
import { rewriteOuterLimit } from "./clickhouseSql";
import { contactIdOf, isContactDetailColumn } from "./contactMasking";
import { creditService } from "./creditService";
import { sanitizeClickhouseSql } from "./queryExecutor";
import { schemaDiscoveryService } from "./schemaDiscovery";
import { searchPlanCache, searchPlanKey } from "./searchPlanCache";
import { searchOrchestrator } from "./searchOrchestrator";
import { sqlGeneratorAgent } from "./sqlGeneratorAgent";
import { sqlReviewerAgent } from "./sqlReviewerAgent";
import { sqlValidator } from "./sqlValidator";

const logger = getLogger("leadgen.export_service");

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Python repr() of a scalar or list, as used when lists are stringified into CSV cells. */
function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replaceAll(quote, `\\${quote}`);
    return `${quote}${escaped}${quote}`;
  }
  return pyStr(value);
}

/** Python str() of a cell value. */
function pyStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  return JSON.stringify(value);
}

/**
 * Protects CSV cells from spreadsheet formula injection: values starting with
 * =, +, -, @, tab or carriage return are prefixed with a single quote.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = pyStr(value);
  return str.length > 0 && FORMULA_PREFIXES.has(str[0]) ? `'${str}` : str;
}

/** RFC 4180 field encoding with minimal quoting (Python csv.QUOTE_MINIMAL). */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvLine(fields: string[]): string {
  return `${fields.map(csvField).join(",")}\r\n`;
}

/** Sets the outer query's LIMIT to the export cap (removing any OFFSET); limits inside subqueries are kept. */
export function applyExportLimit(sql: string, maxRows: number): string {
  return rewriteOuterLimit(sql, maxRows, 0);
}

async function writeCsv(filePath: string, columns: string[], rows: unknown[][]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(filePath, { encoding: "utf-8", mode: 0o600 });
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.write(csvLine(columns));
    for (const row of rows) stream.write(csvLine(row.map(sanitizeCsvCell)));
    stream.end();
  });
}

class ExportService {
  private readonly pending = new Set<Promise<void>>();

  async createExportJob(
    request: SearchRequest,
    userId: number,
    orgId: number,
    userRole: string,
    maxRows: number | null = null,
  ): Promise<ExportJob> {
    const s = getSettings();
    const codec = getCodec();
    const capRows = Math.min(maxRows || s.EXPORT_MAX_ROWS, s.EXPORT_MAX_ROWS);
    const now = new Date();
    const row = await getDb()
      .insertInto("export_jobs")
      .values({
        org_id: orgId,
        user_id: userId,
        status: ExportStatus.QUEUED,
        search_target: request.search_target,
        total_rows: 0,
        file_path: null,
        download_token: randomBytes(32).toString("base64url"),
        error_message: null,
        query_snapshot: codec.json(request),
        created_at: codec.date(now),
        completed_at: null,
        expires_at: codec.date(new Date(now.getTime() + s.EXPORT_EXPIRATION_HOURS * 3600_000)),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const job = toExportJob(codec, row);

    // Process asynchronously; the client polls the job status.
    const task = this.processExportJob(job.id, request, userRole, capRows).catch((err) =>
      logger.error(`Export worker for job ${job.id} crashed`, err),
    );
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));

    await auditService.logEvent({
      action: "CREATE_EXPORT_JOB",
      resource: `export:${job.id}`,
      status: "QUEUED",
      orgId,
      userId,
      details: { job_id: job.id, target: request.search_target, max_rows: capRows },
    });
    return job;
  }

  /** Background worker: generate, review, validate, execute and write the sanitized CSV. */
  async processExportJob(jobId: number, request: SearchRequest, userRole: string, maxRows: number): Promise<void> {
    logger.info(`Starting async export worker for job ${jobId}`);
    const db = getDb();
    const codec = getCodec();

    const job = await db.selectFrom("export_jobs").select(["id", "org_id", "user_id"]).where("id", "=", jobId).executeTakeFirst();
    if (!job) return;
    await db.updateTable("export_jobs").set({ status: ExportStatus.RUNNING }).where("id", "=", jobId).execute();

    try {
      const rep = searchOrchestrator.buildIntermediateRepresentation(request, userRole);
      // The plan approved when this search ran exports exactly the rows the user saw; otherwise generate and review one.
      const plan = searchPlanCache.get(searchPlanKey(rep, request.natural_query, schemaDiscoveryService.lastFingerprint));
      let sql: string;
      let parameters: Record<string, unknown>;
      if (plan) {
        sql = plan.clickhouseSql;
        parameters = plan.parameters;
      } else {
        const gen = await sqlGeneratorAgent.generateSql(rep, request.natural_query);
        const review = await sqlReviewerAgent.reviewSql(rep, gen, request.natural_query);
        if (review.verdict !== "APPROVED") {
          throw new PolicyViolationError(`Export query rejected by reviewer: ${review.reasoning}`);
        }
        sql = gen.clickhouse_sql;
        parameters = gen.parameters;
      }

      // Validate the exact text that runs.
      const exportSql = applyExportLimit(sanitizeClickhouseSql(sql), maxRows);
      const validation = sqlValidator.validateSql(exportSql, userRole, true);
      if (!validation.valid) {
        throw new PolicyViolationError(`Export query policy violation: ${validation.violations.join("; ")}`);
      }
      const { columns, rows } = await chService.executeQuery(exportSql, parameters, 60);

      // Contact details are paid for: charge for contacts this workspace hasn't revealed before.
      if (creditService.enabled && columns.some(isContactDetailColumn)) {
        const idIndex = columns.findIndex((column) => contactIdOf({ [column]: "x" }) !== null);
        if (idIndex === -1) throw new PolicyViolationError("The export contains contact details but no contact id, so it can't be charged.");
        const ids = rows.map((row) => String(row[idIndex] ?? "").trim()).filter(Boolean);
        await creditService.chargeForContacts(job.org_id, job.user_id, ids, "export", `export:${jobId}`);
      }

      const storageDir = resolveFromCwd(getSettings().EXPORT_STORAGE_PATH);
      await fs.promises.mkdir(storageDir, { recursive: true, mode: 0o700 });
      const fileName = `export_${job.org_id}_${job.id}_${randomBytes(8).toString("hex")}.csv`;
      const filePath = path.join(getSettings().EXPORT_STORAGE_PATH, fileName);
      await writeCsv(resolveFromCwd(filePath), columns, rows);

      const stat = await fs.promises.stat(resolveFromCwd(filePath)).catch(() => null);
      if (!stat || stat.size === 0) throw new Error("Export file was not successfully created or is empty.");

      await db
        .updateTable("export_jobs")
        .set({
          status: ExportStatus.COMPLETED,
          file_path: filePath,
          total_rows: rows.length,
          completed_at: codec.date(new Date()),
        })
        .where("id", "=", jobId)
        .execute();

      await auditService.logEvent({
        action: "EXPORT_COMPLETED",
        resource: `export:${jobId}`,
        status: "SUCCESS",
        orgId: job.org_id,
        userId: job.user_id,
        details: { total_rows: rows.length, file_path: filePath },
      });
      logger.info(`Export job ${jobId} completed successfully with ${rows.length} rows.`);
    } catch (err) {
      const message = errorMessage(err);
      logger.error(`Export job ${jobId} failed: ${message}`);
      await db
        .updateTable("export_jobs")
        .set({ status: ExportStatus.FAILED, error_message: message, completed_at: codec.date(new Date()) })
        .where("id", "=", jobId)
        .execute();
      await auditService.logEvent({
        action: "EXPORT_FAILED",
        resource: `export:${jobId}`,
        status: "FAILED",
        orgId: job.org_id,
        userId: job.user_id,
        details: { error: message },
      });
    }
  }

  async getJobByToken(token: string): Promise<ExportJob | null> {
    const row = await getDb().selectFrom("export_jobs").selectAll().where("download_token", "=", token).executeTakeFirst();
    return row ? toExportJob(getCodec(), row) : null;
  }

  /** Deletes expired export files and marks their jobs EXPIRED. */
  async cleanupExpiredExports(): Promise<number> {
    const db = getDb();
    const codec = getCodec();
    const expired = await db
      .selectFrom("export_jobs")
      .select(["id", "file_path"])
      .where("expires_at", "<", codec.date(new Date()))
      .where("status", "=", ExportStatus.COMPLETED)
      .execute();

    for (const job of expired) {
      if (job.file_path) {
        await fs.promises.rm(resolveFromCwd(job.file_path), { force: true }).catch((err) =>
          logger.warn(`Failed to delete expired export file ${job.file_path}: ${errorMessage(err)}`),
        );
      }
      await db.updateTable("export_jobs").set({ status: ExportStatus.EXPIRED }).where("id", "=", job.id).execute();
    }
    return expired.length;
  }

  /** Resolves once all in-flight export workers have finished (used for shutdown and tests). */
  async drain(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending]);
    }
  }
}

export const exportService = singleton("exportService", () => new ExportService());
