import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROUTES } from "@/config/site";
import { ensureDatabaseReady } from "@/server/bootstrap";
import { AuthConfigurationError, getAuthConfig } from "./config";
import { decodeSessionToken, encodeSessionToken, SESSION_COOKIE } from "./token";
import { loadActiveUser } from "./users";

const SESSION_TTL_SECONDS = 12 * 60 * 60;
const REMEMBERED_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface Session {
  userId: number;
  email: string;
  role: string;
  orgId: number;
  workspaceName: string;
  issuedAt: number;
  expiresAt: number;
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
  userId: number;
  /** Keep the session for 30 days instead of until the browser closes. */
  remember: boolean;
}

/** Issues a session cookie. Only callable from a Server Action or Route Handler. */
export async function createSession({ userId, remember }: CreateSessionInput): Promise<void> {
  const { secret } = getAuthConfig();
  const issuedAt = nowInSeconds();
  const ttl = remember ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
  const token = encodeSessionToken({ uid: userId, iat: issuedAt, exp: issuedAt + ttl }, secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttpsRequest(),
    path: "/",
    ...(remember ? { maxAge: ttl } : {}),
  });
}

/** The current visitor's session: a valid cookie for an existing, active account. */
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

  const payload = decodeSessionToken(token, secret);
  if (!payload) return null;

  await ensureDatabaseReady();
  const signedIn = await loadActiveUser(payload.uid);
  if (!signedIn) return null;

  return {
    userId: signedIn.user.id,
    email: signedIn.user.email,
    role: signedIn.user.role,
    orgId: signedIn.user.org_id,
    workspaceName: signedIn.workspaceName,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
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
