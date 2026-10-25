import { requireAuditorOrAdmin } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { toTableRelationship } from "@/server/models/entities";
import { toTableRelationshipResponse } from "@/server/schemas/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  await requireAuditorOrAdmin(request);
  const codec = getCodec();
  const rows = await getDb().selectFrom("table_relationships").selectAll().orderBy("id", "asc").execute();
  return json(rows.map((row) => toTableRelationshipResponse(toTableRelationship(codec, row))));
});
