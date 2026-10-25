import { json, parseBody, route } from "@/server/api/handler";
import { clientAddress } from "@/server/auth/loginThrottle";
import { HttpError } from "@/server/core/errors";
import { RequestLimiter } from "@/server/core/rateLimit";
import { singleton } from "@/server/core/singleton";
import { LLMProviderError } from "@/server/services/llmAdapter";
import { assistantRequestSchema, siteAssistant } from "@/server/services/siteAssistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public endpoint: each visitor gets a few messages per window, and all visitors together a ceiling, to bound model cost.
const perVisitor = singleton("assistantVisitorLimiter", () => new RequestLimiter(20, 10 * 60_000));
const overall = singleton("assistantOverallLimiter", () => new RequestLimiter(600, 60 * 60_000));

/** The landing page assistant: answers questions about The Tentact (no customer data). */
export const POST = route(async (request) => {
  const wait = Math.max(perVisitor.hit(clientAddress(request.headers) ?? "unknown"), overall.hit("all"));
  if (wait > 0) {
    throw new HttpError(429, "You've sent a lot of messages. Please try again in a few minutes, or book a demo with our team.", { "Retry-After": String(wait) });
  }
  const body = await parseBody(request, assistantRequestSchema);
  try {
    return json(await siteAssistant.reply(body));
  } catch (err) {
    if (err instanceof LLMProviderError) throw new HttpError(503, "The assistant is unavailable right now. Please book a demo or email our team.");
    throw err;
  }
});
