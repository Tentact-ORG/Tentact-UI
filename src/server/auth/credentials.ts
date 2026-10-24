import "server-only";
import { getAuthConfig } from "./config";
import { getDummyPasswordHash, verifyPassword } from "./password";

export interface CredentialInput {
  email: string;
  password: string;
}

export interface AuthenticatedAccount {
  email: string;
  workspaceName: string;
}

/**
 * Checks a sign-in attempt against the configured accounts. Returns the account
 * on success and `null` for any failure; it never says which part was wrong.
 * Throws `AuthConfigurationError` if auth is not set up.
 */
export async function verifyCredentials(input: CredentialInput): Promise<AuthenticatedAccount | null> {
  const { accounts } = getAuthConfig();
  const email = input.email.trim().toLowerCase();
  const account = accounts.find((candidate) => candidate.email === email);

  // Always run the (slow) hash comparison so an unknown email costs the same as a wrong password.
  const passwordHash = account?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(input.password, passwordHash);

  if (!account || !passwordMatches) return null;
  return { email: account.email, workspaceName: account.workspaceName };
}
