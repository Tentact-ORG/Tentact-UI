import { getCodec, getDb } from "../core/database";
import { HttpError } from "../core/errors";
import { decodeAccessToken } from "../core/security";
import { toUser, UserRole, type User } from "../models/entities";

const BEARER_CHALLENGE = { "WWW-Authenticate": "Bearer" };

/** Resolves the authenticated, active user from the `Authorization: Bearer` header. */
export async function getCurrentUser(request: Request): Promise<User> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new HttpError(401, "Authentication required", BEARER_CHALLENGE);

  const payload = await decodeAccessToken(match[1].trim());
  const userId = Number(payload.sub);
  if (!payload.sub || !Number.isSafeInteger(userId)) throw new HttpError(401, "Invalid token payload");

  const row = await getDb().selectFrom("users").selectAll().where("id", "=", userId).executeTakeFirst();
  if (!row) throw new HttpError(401, "User not found");
  const user = toUser(getCodec(), row);
  if (!user.is_active) throw new HttpError(403, "Inactive user account");
  return user;
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
