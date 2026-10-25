import { getCurrentUser } from "@/server/api/deps";
import { intParam, json, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ savedId: string }>(async (request, { params }) => {
  const user = await getCurrentUser(request);
  const savedId = intParam(params.savedId, "saved_id");
  const result = await getDb()
    .deleteFrom("saved_searches")
    .where("id", "=", savedId)
    .where("org_id", "=", user.org_id)
    .executeTakeFirst();
  if (Number(result.numDeletedRows) === 0) throw new HttpError(404, "Saved search not found");
  return json({ status: "deleted", id: savedId });
});
