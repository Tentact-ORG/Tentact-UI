import "server-only";

/**
 * Session cookies are signed with `TENTACT_AUTH_SECRET` (at least 32
 * characters). Accounts themselves live in the application database and are
 * managed from the admin console or `npm run bootstrap-admin`.
 */

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export interface AuthConfig {
  secret: string;
}

const MIN_SECRET_LENGTH = 32;

let cachedConfig: AuthConfig | undefined;

/** Reads and validates the configuration once per server process. */
export function getAuthConfig(): AuthConfig {
  if (cachedConfig) return cachedConfig;

  const secret = process.env.TENTACT_AUTH_SECRET?.trim() ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigurationError(`TENTACT_AUTH_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters.`);
  }

  cachedConfig = { secret };
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
