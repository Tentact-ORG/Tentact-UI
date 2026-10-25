import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { HttpError, PolicyViolationError, errorMessage } from "@/server/core/errors";
import { searchRequestSchema } from "@/server/schemas/search";
import { maskSearchRecords } from "@/server/services/contactMasking";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Executes the two-agent search workflow for the authenticated user. Contact
 * details the organization hasn't paid for are masked; `result_id` lets the
 * dashboard reveal them through /api/contacts/reveal.
 */
export const POST = route(async (request) => {
  const user = await getCurrentUser(request);
  const body = await parseBody(request, searchRequestSchema);
  try {
    const result = await searchOrchestrator.executeSearchFlow(body, user.role, user.id, user.org_id);
    const masked = await maskSearchRecords(user.org_id, result.records);
    return json({
      ...result,
      records: masked.records,
      result_id: masked.resultId,
      revealed_ids: masked.revealedIds,
      masked_ids: masked.maskedIds,
      contact_details_masked: masked.masked,
    });
  } catch (err) {
    if (err instanceof PolicyViolationError) throw new HttpError(403, err.message);
    throw new HttpError(400, errorMessage(err));
  }
});
