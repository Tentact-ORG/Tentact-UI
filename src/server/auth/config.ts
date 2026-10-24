import "server-only";
import { workspaceNameFromEmail } from "@/lib/workspace";
import { isPasswordHash } from "./password";

/**
 * Authentication is configured through two environment variables:
 *
 * - `TENTACT_AUTH_SECRET`: at least 32 characters, used to sign session cookies.
 * - `TENTACT_AUTH_ACCOUNTS`: the accounts allowed to sign in, as
 *   `email:passwordHash` or `email:passwordHash:Workspace name` entries
 *   separated by `;`. Hashes come from `scripts/hash-password.mjs`. Without a
 *   workspace name, one is derived from the email domain.
 *
 * This file is the single integration point to swap for a real identity
 * provider or user store.
 */

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export interface ConfiguredAccount {
  email: string;
  passwordHash: string;
  workspaceName: string;
}

export interface AuthConfig {
  secret: string;
  accounts: readonly ConfiguredAccount[];
}

const MIN_SECRET_LENGTH = 32;
const MAX_WORKSPACE_NAME_LENGTH = 60;
const ACCOUNT_SEPARATOR = ";";
const FIELD_SEPARATOR = ":";

let cachedConfig: AuthConfig | undefined;

function parseAccounts(raw: string): ConfiguredAccount[] {
  return raw
    .split(ACCOUNT_SEPARATOR)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const [rawEmail, passwordHash, rawWorkspaceName, ...rest] = entry.split(FIELD_SEPARATOR);
      const email = rawEmail?.trim().toLowerCase();
      const workspaceName = rawWorkspaceName?.trim();

      if (
        !email ||
        !email.includes("@") ||
        !passwordHash ||
        !isPasswordHash(passwordHash) ||
        rest.length > 0 ||
        (workspaceName !== undefined && (workspaceName.length === 0 || workspaceName.length > MAX_WORKSPACE_NAME_LENGTH))
      ) {
        throw new AuthConfigurationError(
          `TENTACT_AUTH_ACCOUNTS entry ${index + 1} is not in the form email:passwordHash[:Workspace name] (see scripts/hash-password.mjs).`,
        );
      }
      return { email, passwordHash, workspaceName: workspaceName ?? workspaceNameFromEmail(email) };
    });
}

/** Reads and validates the configuration once per server process. */
export function getAuthConfig(): AuthConfig {
  if (cachedConfig) return cachedConfig;

  const secret = process.env.TENTACT_AUTH_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigurationError(`TENTACT_AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters.`);
  }

  const accounts = parseAccounts(process.env.TENTACT_AUTH_ACCOUNTS ?? "");
  if (accounts.length === 0) {
    console.warn("[auth] TENTACT_AUTH_ACCOUNTS is empty: no account can sign in.");
  }

  cachedConfig = { secret, accounts };
  return cachedConfig;
}

export function isAuthConfigured(): boolean {
  try {
    getAuthConfig();
    return true;
  } catch (error) {
    if (error instanceof AuthConfigurationError) return false;
    throw error;
  }
}
