import { getCodec, getDb } from "@/server/core/database";
import { singleton } from "@/server/core/singleton";

/**
 * Brute-force protection for sign-in, in two layers:
 *
 * - Account lockout (in the database, so it holds across restarts and
 *   instances): after MAX_FAILURES wrong passwords for one email within
 *   FAILURE_WINDOW_MS, that email can't sign in for LOCKOUT_MS. Unknown emails
 *   lock the same way, so a lockout says nothing about whether an account exists.
 * - A per-client limit (in memory, per instance) on sign-in requests, which
 *   slows password spraying across many emails. The client address comes from
 *   the proxy's X-Forwarded-For / X-Real-IP header; without one the limit is
 *   skipped (a shared bucket would lock everyone out) and the lockout remains
 *   the hard bound.
 */

export const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
export const LOCKOUT_MS = 15 * 60_000;

/** Sign-in requests one client address may make per window, and the window. */
const CLIENT_LIMIT = 30;
const CLIENT_WINDOW_MS = 10 * 60_000;

function normalize(email: string): string {
  return email.trim().toLowerCase().slice(0, 255);
}

/** When `email` is locked out, the time the lockout ends; otherwise null. */
export async function lockedUntil(email: string, now = new Date()): Promise<Date | null> {
  const row = await getDb().selectFrom("login_lockouts").select("locked_until").where("email", "=", normalize(email)).executeTakeFirst();
  const until = row ? getCodec().readNullableDate(row.locked_until) : null;
  return until && until > now ? until : null;
}

/** Counts a failed sign-in; returns the lockout end when this failure locks the email. */
export async function recordFailure(email: string, now = new Date()): Promise<Date | null> {
  const codec = getCodec();
  const key = normalize(email);
  return getDb()
    .transaction()
    .execute(async (trx) => {
      const row = await trx.selectFrom("login_lockouts").selectAll().where("email", "=", key).executeTakeFirst();
      const windowStart = row ? codec.readDate(row.window_started_at) : null;
      const fresh = !row || !windowStart || now.getTime() - windowStart.getTime() > FAILURE_WINDOW_MS || codec.readNullableDate(row.locked_until) !== null;
      const failures = fresh ? 1 : row.failures + 1;
      const lockEnd = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCKOUT_MS) : null;
      const values = {
        failures: lockEnd ? 0 : failures,
        window_started_at: codec.date(fresh ? now : (windowStart ?? now)),
        locked_until: lockEnd ? codec.date(lockEnd) : null,
      };
      if (row) await trx.updateTable("login_lockouts").set(values).where("email", "=", key).execute();
      // A concurrent first failure may have inserted the row already; losing one count there is harmless.
      else await trx.insertInto("login_lockouts").values({ email: key, ...values }).onConflict((oc) => oc.column("email").doNothing()).execute();
      return lockEnd;
    });
}

/** Clears the failure count after a successful sign-in. */
export async function recordSuccess(email: string): Promise<void> {
  await getDb().deleteFrom("login_lockouts").where("email", "=", normalize(email)).execute();
}

/** Fixed-window request counter per key, bounded in size. */
class RequestLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Counts a request; returns the seconds to wait when `key` is over the limit, otherwise 0. */
  hit(key: string, now = Date.now()): number {
    let entry = this.windows.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      entry = { start: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, entry);
      while (this.windows.size > this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest === undefined) break;
        this.windows.delete(oldest);
      }
    }
    entry.count += 1;
    return entry.count > this.limit ? Math.ceil((entry.start + this.windowMs - now) / 1000) : 0;
  }

  reset(): void {
    this.windows.clear();
  }
}

export const signInLimiter = singleton("signInLimiter", () => new RequestLimiter(CLIENT_LIMIT, CLIENT_WINDOW_MS));

/** The client address a proxy reported for this request, or null when there is none. */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}
