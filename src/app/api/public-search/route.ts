import { z } from "zod";
import { json, parseBody, route } from "@/server/api/handler";
import { getSettings } from "@/server/core/config";
import { HttpError } from "@/server/core/errors";
import { getLogger } from "@/server/core/logger";
import { RequestLimiter } from "@/server/core/rateLimit";
import { singleton } from "@/server/core/singleton";
import { runPublicProspectSearch } from "@/server/services/publicProspectSearch";
import {
  publicSearchLimiter,
  PublicSearchUnavailableError,
  trustedClientAddress,
  type AttemptStatus,
  type PublicSearchLimiter,
} from "@/server/services/publicSearchLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hosts with a request time limit (Vercel): AI search takes 25–40 s, so allow up to the Hobby plan's 60 s.
export const maxDuration = 60;

const logger = getLogger("leadgen.public_search");

const publicSearchSchema = z.object({ query: z.string().trim().min(3).max(300) });

// All visitors together get a ceiling per hour, to bound model and warehouse cost.
const overall = singleton("publicSearchOverallLimiter", () => new RequestLimiter(Math.max(1, getSettings().PUBLIC_SEARCH_HOURLY_CAP), 60 * 60_000));

const CLARIFY =
  "That's a little too broad to search. Add a job title or seniority, plus an industry, company size or location, e.g. “CTOs at fintech startups with 11–50 employees in Germany”. This one didn't count toward your free searches.";
const UNAVAILABLE = "Search is unavailable right now. Please try again later, or book a demo with our team.";

function attempts(status: AttemptStatus) {
  return { limit: status.limit, remaining: status.remaining, resets_at: status.resetsAt?.toISOString() ?? null };
}

function visitorAddress(request: Request): string {
  const address = trustedClientAddress(request.headers);
  if (!address) throw new HttpError(400, "We couldn't identify your connection, so search isn't available.");
  return address;
}

function limiterOrUnavailable(): PublicSearchLimiter {
  try {
    return publicSearchLimiter();
  } catch (err) {
    if (err instanceof PublicSearchUnavailableError) throw new HttpError(503, UNAVAILABLE);
    throw err;
  }
}

/** How many searches this visitor has left, without using one. */
export const GET = route(async (request) => {
  const address = visitorAddress(request);
  try {
    return json({ attempts: attempts(await limiterOrUnavailable().status(address)) });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    logger.warn("Could not read public search attempts", err);
    throw new HttpError(503, UNAVAILABLE);
  }
});

/**
 * A signed-out visitor's search: 10 people matching the request, with contact
 * details withheld. Each visitor (by IP address) gets PUBLIC_SEARCH_LIMIT
 * searches per window, counted in Supabase before the search runs; a search
 * that fails on our side, or needs a clearer request, gives the attempt back.
 */
export const POST = route(async (request) => {
  const address = visitorAddress(request);
  const { query } = await parseBody(request, publicSearchSchema);
  const limiter = limiterOrUnavailable();

  let decision;
  try {
    decision = await limiter.consume(address);
  } catch (err) {
    // Fail closed: without the counter, nobody searches.
    logger.warn("Could not count a public search attempt", err);
    throw new HttpError(503, UNAVAILABLE);
  }
  if (!decision.allowed) {
    return json({ detail: "You've used your free searches for today. Book a demo or sign in to keep searching.", attempts: attempts(decision) }, 429);
  }
  if (overall.hit("all") > 0) {
    await limiter.refund(address).catch(() => undefined);
    throw new HttpError(503, "Search is busy right now. Please try again in a little while.");
  }

  try {
    const outcome = await runPublicProspectSearch(query);
    if (outcome.kind === "clarify") {
      // The pipeline's question names warehouse columns; visitors get plain guidance instead.
      await limiter.refund(address);
      return json({ status: "clarify", message: CLARIFY, attempts: attempts(await limiter.status(address)) });
    }
    return json({ status: "ok", prospects: outcome.prospects, total: outcome.total, exact_total: outcome.exact, attempts: attempts(decision) });
  } catch (err) {
    logger.warn("Public search failed", err);
    await limiter.refund(address).catch(() => undefined);
    const refunded = await limiter.status(address).catch(() => null);
    return json({ detail: "We couldn't run that search right now. It didn't count toward your free searches; please try again.", attempts: refunded ? attempts(refunded) : null }, 503);
  }
});
