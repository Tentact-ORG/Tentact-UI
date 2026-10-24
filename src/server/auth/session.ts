import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTES } from "@/config/site";
import { AuthConfigurationError, getAuthConfig } from "./config";

/**
 * Sessions are stateless: an HMAC-SHA256 signed token in an HttpOnly cookie.
 * Revocation before expiry requires rotating the secret.
 */
export const SESSION_COOKIE = "tentact_session";

const TOKEN_VERSION = 2;
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_WORKSPACE_NAME_LENGTH = 60;

export interface Session {
  email: string;
  workspaceName: string;
  issuedAt: number;
  expiresAt: number;
}

interface TokenPayload {
  v: number;
  email: string;
  ws: string;
  iat: number;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function encodeToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === TOKEN_VERSION &&
    typeof candidate.email === "string" &&
    candidate.email.includes("@") &&
    typeof candidate.ws === "string" &&
    candidate.ws.length > 0 &&
    candidate.ws.length <= MAX_WORKSPACE_NAME_LENGTH &&
    Number.isInteger(candidate.iat) &&
    Number.isInteger(candidate.exp)
  );
}

function decodeToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const payload: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return isTokenPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Whether the cookie must be `Secure`, decided by the protocol of this request
 * rather than the build mode. A Secure cookie set over plain HTTP is dropped by
 * Safari (even on localhost), which would sign the visitor out on their next
 * click. Next.js sets `x-forwarded-proto` on every request, or passes through a
 * proxy's value.
 */
async function isHttpsRequest(): Promise<boolean> {
  const forwarded = (await headers()).get("x-forwarded-proto");
  const protocol = forwarded?.split(",")[0]?.trim().toLowerCase();
  if (protocol) return protocol === "https";
  return process.env.NODE_ENV === "production";
}

interface CreateSessionInput {
  email: string;
  workspaceName: string;
  /** Keep the session for 30 days instead of until the browser closes. */
  remember: boolean;
}

/** Issues a session cookie. Only callable from a Server Action or Route Handler. */
export async function createSession({ email, workspaceName, remember }: CreateSessionInput): Promise<void> {
  const { secret } = getAuthConfig();
  const issuedAt = nowInSeconds();
  const ttl = remember ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  const token = encodeToken({ v: TOKEN_VERSION, email, ws: workspaceName, iat: issuedAt, exp: issuedAt + ttl }, secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttpsRequest(),
    path: "/",
    ...(remember ? { maxAge: ttl } : {}),
  });
}

/** The current visitor's session, if the cookie is present, signed and unexpired. */
export async function readSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let secret: string;
  try {
    ({ secret } = getAuthConfig());
  } catch (error) {
    if (error instanceof AuthConfigurationError) return null;
    throw error;
  }

  const payload = decodeToken(token, secret);
  if (!payload || payload.exp <= nowInSeconds()) return null;

  return { email: payload.email, workspaceName: payload.ws, issuedAt: payload.iat, expiresAt: payload.exp };
}

/** Returns the session or sends the visitor to the sign-in page. */
export async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) redirect(ROUTES.login);
  return session;
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
