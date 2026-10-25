import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { HttpError, PolicyViolationError, errorMessage } from "@/server/core/errors";
import { searchRequestSchema } from "@/server/schemas/search";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Executes the two-agent search workflow for the authenticated user. */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, searchRequestSchema);
  try {
    const result = await searchOrchestrator.executeSearchFlow(body, user.role, user.id, user.org_id);
    return json(result);
  } catch (err) {
    if (err instanceof PolicyViolationError) throw new HttpError(403, err.message);
    throw new HttpError(400, errorMessage(err));
  }
});
