import { getCurrentUser } from "@/server/api/deps";
import { intParam, json, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { toExportJob } from "@/server/models/entities";
import { toExportJobResponse } from "@/server/schemas/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ jobId: string }>(async (request, { params }) => {
  const user = await getCurrentUser(request);
  const jobId = intParam(params.jobId, "job_id");
  const row = await getDb()
    .selectFrom("export_jobs")
    .selectAll()
    .where("id", "=", jobId)
    .where("org_id", "=", user.org_id)
    .executeTakeFirst();
  if (!row) throw new HttpError(404, "Export job not found");
  return json(toExportJobResponse(toExportJob(getCodec(), row)));
});
