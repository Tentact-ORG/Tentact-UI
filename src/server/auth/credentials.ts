import "server-only";
import { getCodec, getDb } from "@/server/core/database";
import { hashPassword, verifyPassword } from "@/server/core/security";
import { toUser } from "@/server/models/entities";
import { auditService } from "@/server/services/auditService";
import { clientAddress, lockedUntil, recordFailure, recordSuccess, signInLimiter } from "./loginThrottle";

export interface CredentialInput {
  email: string;
  password: string;
}

export interface AuthenticatedAccount {
  userId: number;
  email: string;
}

export type SignInResult =
  | { ok: true; account: AuthenticatedAccount; user: ReturnType<typeof toUser> }
  /** Wrong email or password, or a deactivated account (`inactive`, for API clients that report it). */
  | { ok: false; reason: "invalid" | "inactive" }
  /** Too many failures for this email, or too many requests from this client. */
  | { ok: false; reason: "locked" | "rate_limited"; retryAfterSec: number };

/** Applies the per-client sign-in limit; returns the seconds to wait, or 0. */
export function signInRateLimit(headers: Headers): number {
  const address = clientAddress(headers);
  return address ? signInLimiter.hit(address) : 0;
}

let dummyHash: Promise<string> | undefined;

/** A throw-away hash verified when no account matches, so an unknown email costs as much as a wrong password. */
function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("tentact-timing-equalizer");
  return dummyHash;
}

/**
 * Checks a sign-in attempt against the application's user accounts, enforcing
 * the per-client limit and the account lockout (see loginThrottle). Failures
 * never say which part was wrong.
 */
export async function authenticate(input: CredentialInput, headers: Headers): Promise<SignInResult> {
  const email = input.email.trim().toLowerCase();

  const wait = signInRateLimit(headers);
  if (wait > 0) {
    await auditService.logEvent({ action: "LOGIN_RATE_LIMITED", resource: `user:${email}`, status: "RATE_LIMITED", details: { email } });
    return { ok: false, reason: "rate_limited", retryAfterSec: wait };
  }
  const locked = await lockedUntil(email);
  if (locked) {
    await auditService.logEvent({ action: "LOGIN_LOCKED", resource: `user:${email}`, status: "LOCKED", details: { email, locked_until: locked.toISOString() } });
    return { ok: false, reason: "locked", retryAfterSec: Math.ceil((locked.getTime() - Date.now()) / 1000) };
  }

  const row = await getDb().selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
  const user = row ? toUser(getCodec(), row) : null;

  // Always run the (slow) hash comparison.
  const passwordMatches = await verifyPassword(input.password, user?.hashed_password ?? (await getDummyPasswordHash()));

  if (!user || !passwordMatches || !user.is_active) {
    const inactive = user !== null && passwordMatches;
    // A correct password for a deactivated account isn't a guess, so it doesn't count towards a lockout.
    const lockEnd = inactive ? null : await recordFailure(email);
    await auditService.logEvent({
      action: "LOGIN_FAILED",
      resource: `user:${email}`,
      status: "UNAUTHORIZED",
      orgId: user?.org_id ?? null,
      details: { email, reason: inactive ? "inactive" : "invalid_credentials", ...(lockEnd ? { locked_until: lockEnd.toISOString() } : {}) },
    });
    return { ok: false, reason: inactive ? "inactive" : "invalid" };
  }

  await recordSuccess(email);
  await auditService.logEvent({ action: "LOGIN_SUCCESS", resource: `user:${user.id}`, status: "SUCCESS", orgId: user.org_id, userId: user.id });
  return { ok: true, account: { userId: user.id, email: user.email }, user };
}
