import { createHash } from "node:crypto";
import { getSettings } from "../core/config";
import type { Insertable } from "kysely";
import { getCodec, getDb, type DiscoveredSchemasTable } from "../core/database";
import { getLogger } from "../core/logger";
import { singleton } from "../core/singleton";
import { DEFAULT_ALLOWED_OPERATIONS, RelationshipStatus, SensitivityLevel, toDiscoveredColumn } from "../models/entities";
import { auditService } from "./auditService";
import { chService } from "./clickhouseClient";

const logger = getLogger("leadgen.schema_discovery");

export interface CachedColumn {
  name: string;
  type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_approved: boolean;
  sensitivity: string;
  allowed_operations: string[];
}

export interface CachedTable {
  is_approved: boolean;
  columns: Record<string, CachedColumn>;
}

export type SchemaCache = Record<string, CachedTable>;

export interface SchemaDiscoveryResult {
  database: string;
  tables_count: number;
  columns_count: number;
  fingerprint: string;
  schema_changed: boolean;
  /** Nothing was written: the stored schema already matches the warehouse. */
  unchanged: boolean;
}

interface ParsedColumn {
  name: string;
  type: string;
  is_primary_key: boolean;
  is_nullable: boolean;
}

const pyBool = (v: boolean): string => (v ? "True" : "False");

/**
 * SHA-256 over "table.column:type:is_pk:is_nullable" entries joined by ";", with
 * Python-style booleans so fingerprints match those already stored by the Python service.
 */
export function computeSchemaFingerprint(rows: Array<[string, string, string, boolean, boolean]>): string {
  const parts = rows.map(([tbl, col, type, isPk, isNull]) => `${tbl}.${col}:${type}:${pyBool(isPk)}:${pyBool(isNull)}`);
  return createHash("sha256").update(parts.join(";"), "utf8").digest("hex");
}

export function classifySensitivity(columnName: string): SensitivityLevel {
  const col = columnName.toLowerCase();
  // "arr" (annual recurring revenue) only as a whole name token, so e.g. COMBINED_TECH_ARRAY_ORG stays public.
  const tokens = col.split(/[^a-z0-9]+/);
  if (["confidential", "secret", "salary", "revenue_actual", "internal"].some((t) => col.includes(t)) || tokens.includes("arr")) {
    return SensitivityLevel.RESTRICTED;
  }
  if (["direct_phone", "personal_phone", "ssn", "passport"].some((t) => col.includes(t))) {
    return SensitivityLevel.RESTRICTED;
  }
  if (["ip_address", "cookie", "token", "raw_payload"].some((t) => col.includes(t))) {
    return SensitivityLevel.INTERNAL;
  }
  return SensitivityLevel.PUBLIC;
}

/**
 * Earlier releases matched "arr" anywhere in a column name, so columns such as
 * COMBINED_TECH_ARRAY_ORG were stored as RESTRICTED. True when that substring
 * rule is the only reason for a stored RESTRICTED value, so it can be corrected.
 */
function isLegacyArrMisclassification(columnName: string, storedSensitivity: string): boolean {
  return (
    storedSensitivity === SensitivityLevel.RESTRICTED &&
    columnName.toLowerCase().includes("arr") &&
    classifySensitivity(columnName) !== SensitivityLevel.RESTRICTED
  );
}

function isDefaultApproved(targetDb: string, tableName: string): boolean {
  // In growstack, strictly approve only the curated lead tables and the company enrichment table.
  if (targetDb === "growstack") {
    return ["new_combined_data", "new_company_data", "new_company_data_10_26", "company_data"].includes(tableName);
  }
  return !(tableName.includes("raw_") || tableName.includes("event") || tableName.includes("temp"));
}

class SchemaDiscoveryService {
  private schemaCache: SchemaCache = {};
  private ready = false;
  private lastFingerprintValue: string | null = null;
  private lastRefreshTimeValue: Date | null = null;

  get isReady(): boolean {
    return this.ready;
  }

  get lastFingerprint(): string | null {
    return this.lastFingerprintValue;
  }

  get lastRefreshTime(): Date | null {
    return this.lastRefreshTimeValue;
  }

  /** Returns the in-memory cache of discovered tables and columns. */
  getCachedSchema(): SchemaCache {
    return this.schemaCache;
  }

  /**
   * Inspects the ClickHouse system catalog for the configured database, computes the
   * schema fingerprint, detects drift and updates the metadata registry.
   */
  async discoverClickhouseSchema(): Promise<SchemaDiscoveryResult> {
    const targetDb = getSettings().CLICKHOUSE_DATABASE;
    const db = getDb();
    const codec = getCodec();
    logger.info(`Discovering ClickHouse schema for database: ${targetDb}`);

    const tables = await chService.executeQuery("SELECT name, engine FROM system.tables WHERE database = {database:String} ORDER BY name", {
      database: targetDb,
    });
    const tableNames = tables.rows.map((row) => String(row[0]));

    const columns = await chService.executeQuery(
      `SELECT table, name, type, is_in_primary_key, like(type, '%Nullable%') AS is_nullable
       FROM system.columns WHERE database = {database:String} ORDER BY table, name`,
      { database: targetDb },
    );

    const fingerprintRows: Array<[string, string, string, boolean, boolean]> = [];
    const parsedSchema = new Map<string, Map<string, ParsedColumn>>();
    for (const row of columns.rows) {
      const [tbl, col, type] = [String(row[0]), String(row[1]), String(row[2])];
      const isPk = Boolean(row[3]);
      const isNull = Boolean(row[4]);
      fingerprintRows.push([tbl, col, type, isPk, isNull]);
      if (!parsedSchema.has(tbl)) parsedSchema.set(tbl, new Map());
      parsedSchema.get(tbl)!.set(col, { name: col, type, is_primary_key: isPk, is_nullable: isNull });
    }
    const fingerprintHash = computeSchemaFingerprint(fingerprintRows);

    const activeFp = await db
      .selectFrom("schema_fingerprints")
      .selectAll()
      .where("database_name", "=", targetDb)
      .where("status", "=", "active")
      .orderBy("id", "desc")
      .limit(1)
      .executeTakeFirst();

    let schemaChanged = false;
    if (activeFp && activeFp.fingerprint_hash !== fingerprintHash) {
      logger.warn(`Schema change detected! Previous hash: ${activeFp.fingerprint_hash}, new hash: ${fingerprintHash}`);
      schemaChanged = true;
      await db.updateTable("schema_fingerprints").set({ status: "superseded" }).where("id", "=", activeFp.id).execute();
      await this.handleSchemaInvalidation(parsedSchema);
    }

    const now = new Date();
    if (!activeFp || schemaChanged) {
      await db
        .insertInto("schema_fingerprints")
        .values({
          database_name: targetDb,
          fingerprint_hash: fingerprintHash,
          table_count: tableNames.length,
          column_count: columns.rows.length,
          detected_at: codec.date(now),
          status: "active",
        })
        .execute();
    }

    const existingRows = await db.selectFrom("discovered_schemas").selectAll().where("database_name", "=", targetDb).execute();
    const existing = new Map(existingRows.map((r) => [`${r.table_name}\u0000${r.column_name}`, r]));
    // Same warehouse fingerprint and every column already stored: nothing to write. This keeps
    // startup cheap on hosts that start often (serverless), where 399 row writes didn't finish.
    const unchanged = activeFp !== undefined && !schemaChanged && existingRows.length === columns.rows.length;

    const newRows: Insertable<DiscoveredSchemasTable>[] = [];
    if (!unchanged)
      await db.transaction().execute(async (trx) => {
        for (const [tbl, cols] of parsedSchema) {
          const approved = isDefaultApproved(targetDb, tbl);
          for (const [col, meta] of cols) {
            const current = existing.get(`${tbl}\u0000${col}`);
            const differs =
              current &&
              (current.data_type !== meta.type ||
                Boolean(current.is_nullable) !== meta.is_nullable ||
                Boolean(current.is_primary_key) !== meta.is_primary_key ||
                Boolean(current.is_approved) !== approved ||
                isLegacyArrMisclassification(col, current.sensitivity));
            if (current && differs) {
              await trx
                .updateTable("discovered_schemas")
                .set({
                  data_type: meta.type,
                  is_nullable: codec.bool(meta.is_nullable),
                  is_primary_key: codec.bool(meta.is_primary_key),
                  is_approved: codec.bool(approved),
                  discovery_status: "ready",
                  last_refreshed_at: codec.date(now),
                  ...(isLegacyArrMisclassification(col, current.sensitivity) ? { sensitivity: classifySensitivity(col) } : {}),
                })
                .where("id", "=", current.id)
                .execute();
            } else if (!current) {
              newRows.push({
                database_name: targetDb,
                table_name: tbl,
                column_name: col,
                data_type: meta.type,
                is_nullable: codec.bool(meta.is_nullable),
                is_primary_key: codec.bool(meta.is_primary_key),
                is_approved: codec.bool(approved),
                sensitivity: classifySensitivity(col),
                allowed_operations: codec.json(DEFAULT_ALLOWED_OPERATIONS),
                discovery_status: "ready",
                strategy: "auto",
                last_refreshed_at: codec.date(now),
              });
            }
          }
        }
        // New columns in a few multi-row statements instead of one round trip each.
        for (let i = 0; i < newRows.length; i += 200) {
          await trx
            .insertInto("discovered_schemas")
            .values(newRows.slice(i, i + 200))
            .execute();
        }
        await trx
          .updateTable("discovered_schemas")
          .set({ last_refreshed_at: codec.date(now) })
          .where("database_name", "=", targetDb)
          .execute();
      });

    await this.loadSchemaCache();

    const summary = Object.entries(this.schemaCache).map(([tbl, info]) => {
      const names = Object.keys(info.columns);
      const preview = names.slice(0, 12).join(", ") + (names.length > 12 ? "..." : "");
      return `  -> Table: ${tbl} (${names.length} headers): ${preview}`;
    });
    logger.info(
      `[CLICKHOUSE HEADERS DISCOVERED] Database: '${targetDb}' | Total Tables: ${Object.keys(this.schemaCache).length} | ` +
        `Total Headers/Columns: ${columns.rows.length}\n${summary.join("\n")}`,
    );

    this.lastFingerprintValue = fingerprintHash;
    this.lastRefreshTimeValue = now;
    this.ready = true;

    const result: SchemaDiscoveryResult = {
      database: targetDb,
      tables_count: tableNames.length,
      columns_count: columns.rows.length,
      fingerprint: fingerprintHash,
      schema_changed: schemaChanged,
      unchanged,
    };
    await auditService.logEvent({
      action: "SCHEMA_DISCOVERY",
      resource: `clickhouse.${targetDb}`,
      status: "SUCCESS",
      details: {
        tables_count: result.tables_count,
        columns_count: result.columns_count,
        fingerprint: result.fingerprint,
        schema_changed: result.schema_changed,
      },
    });
    return result;
  }

  /** Invalidates approved/pending relationships whose tables or columns no longer exist. */
  private async handleSchemaInvalidation(currentSchema: Map<string, Map<string, ParsedColumn>>): Promise<void> {
    const db = getDb();
    const relationships = await db
      .selectFrom("table_relationships")
      .selectAll()
      .where("status", "in", [RelationshipStatus.APPROVED, RelationshipStatus.PENDING])
      .execute();

    for (const rel of relationships) {
      const srcExists = currentSchema.get(rel.source_table)?.has(rel.source_column) ?? false;
      const tgtExists = currentSchema.get(rel.target_table)?.has(rel.target_column) ?? false;
      if (!(srcExists && tgtExists)) {
        await db
          .updateTable("table_relationships")
          .set({
            status: RelationshipStatus.INVALIDATED,
            evidence: `${rel.evidence} [INVALIDATED: Column or table missing in fingerprint at ${new Date().toISOString()}]`,
          })
          .where("id", "=", rel.id)
          .execute();
      }
    }
  }

  /** Loads verified schema metadata into the in-memory cache used by the agents and validator. */
  async loadSchemaCache(): Promise<void> {
    const codec = getCodec();
    const rows = await getDb()
      .selectFrom("discovered_schemas")
      .selectAll()
      .where("database_name", "=", getSettings().CLICKHOUSE_DATABASE)
      .orderBy("id")
      .execute();

    const cache: SchemaCache = {};
    for (const row of rows) {
      const c = toDiscoveredColumn(codec, row);
      if (!cache[c.table_name]) {
        cache[c.table_name] = { columns: {}, is_approved: c.is_approved };
      }
      cache[c.table_name].columns[c.column_name] = {
        name: c.column_name,
        type: c.data_type,
        is_nullable: c.is_nullable,
        is_primary_key: c.is_primary_key,
        is_approved: c.is_approved,
        sensitivity: c.sensitivity,
        allowed_operations: c.allowed_operations,
      };
    }
    this.schemaCache = cache;
    this.ready = Object.keys(cache).length > 0;
  }
}

export const schemaDiscoveryService = singleton("schemaDiscovery", () => new SchemaDiscoveryService());
