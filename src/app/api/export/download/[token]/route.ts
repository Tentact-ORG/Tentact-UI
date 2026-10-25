import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { resolveFromCwd } from "@/server/core/paths";
import { HttpError } from "@/server/core/errors";
import { ExportStatus } from "@/server/models/entities";
import { auditService } from "@/server/services/auditService";
import { exportService } from "@/server/services/exportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;

/** Token-authorized download of a completed export (the token is the capability). */
export const GET = route<{ token: string }>(async (_request, { params }) => {
  if (!TOKEN_PATTERN.test(params.token)) throw new HttpError(404, "Invalid download token");
  const job = await exportService.getJobByToken(params.token);
  if (!job) throw new HttpError(404, "Invalid download token");

  if (job.status !== ExportStatus.COMPLETED || !job.file_path) {
    throw new HttpError(400, "Export is not ready for download");
  }
  if (job.expires_at.getTime() < Date.now()) {
    await getDb().updateTable("export_jobs").set({ status: ExportStatus.EXPIRED }).where("id", "=", job.id).execute();
    throw new HttpError(410, "Export file has expired");
  }

  const absolutePath = resolveFromCwd(job.file_path);
  const stat = await fs.promises.stat(absolutePath).catch(() => null);
  if (!stat?.isFile()) throw new HttpError(404, "Export file missing from private storage");

  await auditService.logEvent({
    action: "DOWNLOAD_EXPORT",
    resource: `export:${job.id}`,
    status: "SUCCESS",
    orgId: job.org_id,
    userId: job.user_id,
    details: { file_name: path.basename(job.file_path) },
  });

  const body = Readable.toWeb(fs.createReadStream(absolutePath)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="leadgen_export_${job.search_target}_${job.id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
