import "server-only";
import { getCodec, getDb } from "@/server/core/database";
import { hashPassword, verifyPassword } from "@/server/core/security";
import { toUser } from "@/server/models/entities";
import { auditService } from "@/server/services/auditService";

export interface CredentialInput {
  email: string;
  password: string;
}

export interface AuthenticatedAccount {
  userId: number;
  email: string;
}

let dummyHash: Promise<string> | undefined;

/** A throw-away hash verified when no account matches, so an unknown email costs as much as a wrong password. */
function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("tentact-timing-equalizer");
  return dummyHash;
}

/**
 * Checks a sign-in attempt against the application's user accounts. Returns the
 * account on success and `null` for any failure (unknown email, wrong password
 * or deactivated account); it never says which part was wrong.
 */
export async function verifyCredentials(input: CredentialInput): Promise<AuthenticatedAccount | null> {
  const email = input.email.trim().toLowerCase();
  const row = await getDb().selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
  const user = row ? toUser(getCodec(), row) : null;

  // Always run the (slow) hash comparison.
  const passwordMatches = await verifyPassword(input.password, user?.hashed_password ?? (await getDummyPasswordHash()));

  if (!user || !passwordMatches || !user.is_active) {
    await auditService.logEvent({
      action: "LOGIN_FAILED",
      resource: `user:${email}`,
      status: "UNAUTHORIZED",
      orgId: user?.org_id ?? null,
      details: { email, reason: user && passwordMatches ? "inactive" : "invalid_credentials" },
    });
    return null;
  }

  await auditService.logEvent({ action: "LOGIN_SUCCESS", resource: `user:${user.id}`, status: "SUCCESS", orgId: user.org_id, userId: user.id });
  return { userId: user.id, email: user.email };
}
