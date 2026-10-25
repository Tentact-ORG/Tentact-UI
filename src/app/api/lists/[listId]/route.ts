import { getCurrentUser } from "@/server/api/deps";
import { intParam, json, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { auditService } from "@/server/services/auditService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route<{ listId: string }>(async (request, { params }) => {
  const user = await getCurrentUser(request);
  const listId = intParam(params.listId, "list_id");
  const result = await getDb()
    .deleteFrom("prospect_lists")
    .where("id", "=", listId)
    .where("org_id", "=", user.org_id)
    .executeTakeFirst();
  if (Number(result.numDeletedRows) === 0) throw new HttpError(404, "List not found");
  await auditService.logEvent({ action: "DELETE_LIST", resource: `list:${listId}`, status: "SUCCESS", orgId: user.org_id, userId: user.id });
  return json({ status: "deleted", id: listId });
});
