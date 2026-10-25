/**
 * Checks the landing page search limit against the real Supabase database:
 * fires many simultaneous attempts for one made-up address, expects exactly
 * PUBLIC_SEARCH_LIMIT of them to be allowed, checks a second "visit" sees
 * none left, and removes the test row. Nothing else in the table is touched.
 *
 * Usage: npm run verify-public-search-limit
 */
import { randomBytes } from "node:crypto";
import { getSettings } from "@/server/core/config";
import { errorMessage } from "@/server/core/errors";
import { createSupabasePool, PublicSearchLimiter } from "@/server/services/publicSearchLimit";

const SIMULTANEOUS = 20;

async function main(): Promise<number> {
  const settings = getSettings();
  if (!settings.SUPABASE_DB_URL) {
    console.error("SUPABASE_DB_URL is not set.");
    return 1;
  }
  const pool = createSupabasePool(settings.SUPABASE_DB_URL);
  const limiter = new PublicSearchLimiter(pool, settings.PUBLIC_SEARCH_LIMIT, settings.PUBLIC_SEARCH_WINDOW_HOURS * 3600, settings.PUBLIC_SEARCH_IP_SECRET ?? settings.JWT_SECRET_KEY);
  // An address from the TEST-NET-2 documentation range, unique per run.
  const address = `198.51.100.${1 + randomBytes(1)[0] % 250}#verify-${randomBytes(6).toString("hex")}`;
  try {
    const results = await Promise.all(Array.from({ length: SIMULTANEOUS }, () => limiter.consume(address)));
    const allowed = results.filter((result) => result.allowed).length;
    const later = await new PublicSearchLimiter(pool, limiter.limit, 3600, settings.PUBLIC_SEARCH_IP_SECRET ?? settings.JWT_SECRET_KEY).status(address);
    console.log(`${SIMULTANEOUS} simultaneous attempts: ${allowed} allowed (limit ${limiter.limit}); a later visit sees ${later.remaining} left.`);
    const ok = allowed === limiter.limit && later.remaining === 0;
    console.log(ok ? "OK: the limit holds under concurrency and across visits." : "FAILED: the limit did not hold.");
    return ok ? 0 : 1;
  } finally {
    await pool.query("delete from public.public_search_attempts where ip_hash = $1", [limiter.keyFor(address)]);
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`Verification failed: ${errorMessage(err)}`);
    process.exit(1);
  });
