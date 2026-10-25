import { AuthConfigurationError, getAuthConfig } from "../auth/config";
import { decodeSessionToken, readCookie, SESSION_COOKIE } from "../auth/token";
import { loadActiveUser } from "../auth/users";
import { getCodec, getDb } from "../core/database";
import { HttpError } from "../core/errors";
import { decodeAccessToken } from "../core/security";
import { toUser, UserRole, type User } from "../models/entities";

const BEARER_CHALLENGE = { "WWW-Authenticate": "Bearer" };
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Bearer-token authentication, used by API clients. */
async function userFromBearer(token: string): Promise<User> {
  const payload = await decodeAccessToken(token);
  const userId = Number(payload.sub);
  if (!payload.sub || !Number.isSafeInteger(userId)) throw new HttpError(401, "Invalid token payload");

  const row = await getDb().selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
  if (!row) throw new HttpError(401, "User not found");
  const user = toUser(getCodec(), row);
  if (!user.is_active) throw new HttpError(403, "Inactive user account");
  return user;
}

/**
 * Rejects cookie-authenticated state changes that did not originate from this
 * site. SameSite=Lax already keeps the cookie off cross-site subrequests; this
 * is defence in depth against CSRF.
 */
function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Cross-origin request blocked");
    }
    if (originHost !== host.split(",")[0].trim()) throw new HttpError(403, "Cross-origin request blocked");
    return;
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Cross-origin request blocked");
}

/** Session-cookie authentication, used by the dashboard. */
async function userFromSessionCookie(request: Request, token: string): Promise<User> {
  let secret: string;
  try {
    ({ secret } = getAuthConfig());
  } catch (error) {
    if (error instanceof AuthConfigurationError) throw new HttpError(401, "Authentication required", BEARER_CHALLENGE);
    throw error;
  }
  const payload = decodeSessionToken(token, secret);
  if (!payload) throw new HttpError(401, "Session expired or invalid", BEARER_CHALLENGE);
  assertSameOrigin(request);
  const signedIn = await loadActiveUser(payload.uid);
  if (!signedIn) throw new HttpError(401, "Session expired or invalid", BEARER_CHALLENGE);
  return signedIn.user;
}

/**
 * Resolves the authenticated, active user from an `Authorization: Bearer` header
 * or, failing that, the dashboard's session cookie.
 */
export async function getCurrentUser(request: Request): Promise<User> {
  const header = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer) return userFromBearer(bearer[1].trim());

  const sessionToken = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (sessionToken) return userFromSessionCookie(request, sessionToken);

  throw new HttpError(401, "Authentication required", BEARER_CHALLENGE);
}

export async function requireRole(request: Request, allowedRoles: readonly UserRole[]): Promise<User> {
  const user = await getCurrentUser(request);
  if (!(allowedRoles as readonly string[]).includes(user.role)) {
    const roles = allowedRoles.map((r) => `'${r}'`).join(", ");
    throw new HttpError(403, `Operation requires one of the following roles: [${roles}]`);
  }
  return user;
}

export const requireAdmin = (request: Request) => requireRole(request, [UserRole.ADMIN]);
export const requireAuditorOrAdmin = (request: Request) => requireRole(request, [UserRole.ADMIN, UserRole.AUDITOR]);
