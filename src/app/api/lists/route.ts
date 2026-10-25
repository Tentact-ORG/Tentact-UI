import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { toProspectList } from "@/server/models/entities";
import { createListRequestSchema, toProspectListResponse } from "@/server/schemas/lists";
import { auditService } from "@/server/services/auditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prospect lists of the caller's organization, newest first. */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const codec = getCodec();
  const rows = await getDb()
    .selectFrom("prospect_lists")
    .selectAll()
    .where("org_id", "=", user.org_id)
    .orderBy("id", "desc")
    .execute();
  return json(rows.map((row) => toProspectListResponse(toProspectList(codec, row))));
});

/** Saves a selection of prospects as a named list. */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, createListRequestSchema);
  const codec = getCodec();
  const row = await getDb()
    .insertInto("prospect_lists")
    .values({
      org_id: user.org_id,
      user_id: user.id,
      name: body.name,
      items: codec.json(body.prospects),
      item_count: body.prospects.length,
      created_at: codec.date(new Date()),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const list = toProspectList(codec, row);
  await auditService.logEvent({
    action: "CREATE_LIST",
    resource: `list:${list.id}`,
    status: "SUCCESS",
    orgId: user.org_id,
    userId: user.id,
    details: { name: list.name, prospect_count: list.item_count },
  });
  return json(toProspectListResponse(list));
});
