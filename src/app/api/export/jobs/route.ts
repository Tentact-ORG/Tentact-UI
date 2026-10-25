import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { toExportJob } from "@/server/models/entities";
import { toExportJobResponse } from "@/server/schemas/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Export jobs for the caller's organization only. */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const codec = getCodec();
  const rows = await getDb()
    .selectFrom("export_jobs")
    .selectAll()
    .where("org_id", "=", user.org_id)
    .orderBy("id", "desc")
    .execute();
  return json(rows.map((row) => toExportJobResponse(toExportJob(codec, row))));
});
