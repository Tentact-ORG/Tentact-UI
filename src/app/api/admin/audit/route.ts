import { requireAuditorOrAdmin } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { toAuditEvent } from "@/server/models/entities";
import { toAuditEventResponse } from "@/server/schemas/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The 100 most recent audit events of the caller's organization. */
export const GET = route(async (request) => {
  const user = await requireAuditorOrAdmin(request);
  const codec = getCodec();
  const rows = await getDb()
    .selectFrom("audit_events")
    .selectAll()
    .where("org_id", "=", user.org_id)
    .orderBy("id", "desc")
    .limit(100)
    .execute();
  return json(rows.map((row) => toAuditEventResponse(toAuditEvent(codec, row))));
});
