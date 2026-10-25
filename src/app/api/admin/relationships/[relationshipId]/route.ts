import { requireAdmin } from "@/server/api/deps";
import { intParam, json, parseBody, route } from "@/server/api/handler";
import { HttpError } from "@/server/core/errors";
import { relationshipActionRequestSchema, toTableRelationshipResponse } from "@/server/schemas/admin";
import { relationshipService } from "@/server/services/relationshipDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approves, rejects or invalidates a candidate table relationship. */
export const PATCH = route<{ relationshipId: string }>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const relationshipId = intParam(params.relationshipId, "relationship_id");
  const body = await parseBody(request, relationshipActionRequestSchema);
  const updated = await relationshipService.updateRelationshipStatus(relationshipId, body.status, admin.email);
  if (!updated) throw new HttpError(404, "Relationship not found");
  return json(toTableRelationshipResponse(updated));
});
