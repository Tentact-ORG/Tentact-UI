import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb } from "@/server/core/database";
import { toSavedSearch } from "@/server/models/entities";
import { saveSearchRequestSchema } from "@/server/schemas/search";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, saveSearchRequestSchema);
  const codec = getCodec();
  const rep = searchOrchestrator.buildIntermediateRepresentation(body.search_request, user.role);

  const row = await getDb()
    .insertInto("saved_searches")
    .values({
      org_id: user.org_id,
      user_id: user.id,
      name: body.name,
      description: body.description,
      natural_query: body.search_request.natural_query,
      structured_icp: codec.json(body.search_request.structured_icp ?? {}),
      intermediate_rep: codec.json(rep),
      ui_state: body.ui_state === null ? null : codec.json(body.ui_state),
      created_at: codec.date(new Date()),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const saved = toSavedSearch(codec, row);
  return json({ id: saved.id, name: saved.name, description: saved.description, created_at: saved.created_at });
});

/** Saved searches visible to the caller's organization only. */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const codec = getCodec();
  const rows = await getDb()
    .selectFrom("saved_searches")
    .selectAll()
    .where("org_id", "=", user.org_id)
    .orderBy("id", "desc")
    .execute();
  return json(
    rows.map((row) => {
      const s = toSavedSearch(codec, row);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        natural_query: s.natural_query,
        structured_icp: s.structured_icp,
        ui_state: s.ui_state,
        created_at: s.created_at,
      };
    }),
  );
});
