import { getCurrentUser } from "@/server/api/deps";
import { json, parseBody, route } from "@/server/api/handler";
import { HttpError, errorMessage } from "@/server/core/errors";
import { LLMProviderError } from "@/server/services/llmAdapter";
import { interpretRequestSchema, queryInterpreter } from "@/server/services/queryInterpreter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turns a typed prospect request into dashboard filters for the user to review
 * before searching. Nothing is queried here; the search itself still goes
 * through generation, review, validation and read-only execution.
 */
export const POST = route(async (request) => {
  await getCurrentUser(request);
  const body = await parseBody(request, interpretRequestSchema);
  try {
    return json(await queryInterpreter.interpret(body));
  } catch (err) {
    if (err instanceof LLMProviderError) throw new HttpError(503, "The assistant is unavailable right now. Search the text as typed, or set filters by hand.");
    throw new HttpError(422, errorMessage(err));
  }
});
