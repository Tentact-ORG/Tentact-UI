import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session tokens: an HMAC-SHA256 signed payload that names the signed-in user.
 * Everything else about the user (email, role, organization, active flag) is
 * loaded from the database on every request, so a deactivated account or a role
 * change takes effect immediately.
 */
export const SESSION_COOKIE = "tentact_session";

const TOKEN_VERSION = 3;

export interface SessionTokenPayload {
  v: number;
  /** User id in the application database. */
  uid: number;
  iat: number;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeSessionToken(payload: Omit<SessionTokenPayload, "v">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, ...payload }), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function isTokenPayload(value: unknown): value is SessionTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === TOKEN_VERSION &&
    Number.isSafeInteger(candidate.uid) &&
    (candidate.uid as number) > 0 &&
    Number.isInteger(candidate.iat) &&
    Number.isInteger(candidate.exp)
  );
}

/** The payload of a correctly signed, unexpired token, or null. */
export function decodeSessionToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SessionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!isTokenPayload(payload) || payload.exp <= nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Reads one cookie from a raw `Cookie` header. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}
