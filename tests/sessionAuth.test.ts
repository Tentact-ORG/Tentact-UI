import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as updateUser } from "@/app/api/admin/users/[userId]/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listSaved, POST as saveSearch } from "@/app/api/search/saved/route";
import { POST as apiLogin } from "@/app/api/auth/login/route";
import { authenticate, type CredentialInput } from "@/server/auth/credentials";
import { LOCKOUT_MS, lockedUntil, MAX_FAILURES, signInLimiter } from "@/server/auth/loginThrottle";
import { decodeSessionToken, encodeSessionToken, readCookie, SESSION_COOKIE } from "@/server/auth/token";
import { getCodec, getDb } from "@/server/core/database";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

const SECRET = process.env.TENTACT_AUTH_SECRET!;
const now = () => Math.floor(Date.now() / 1000);

function sessionCookie(userId: number, ttlSeconds = 3600): Record<string, string> {
  const token = encodeSessionToken({ uid: userId, iat: now(), exp: now() + ttlSeconds }, SECRET);
  return { Cookie: `theme=dark; ${SESSION_COOKIE}=${token}`, Host: "test" };
}

describe("dashboard session cookies on the API", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("authenticates API requests with the session cookie", async () => {
    const res = await callRoute(me, { headers: sessionCookie(seed.member.id) });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("member@acme.com");
    expect(res.body.organization.name).toBe("Acme Corporation");
  });

  it("rejects tampered and expired session tokens", async () => {
    const valid = sessionCookie(seed.member.id).Cookie;
    expect((await callRoute(me, { headers: { Cookie: `${valid}x` } })).status).toBe(401);
    expect((await callRoute(me, { headers: sessionCookie(seed.member.id, -10) })).status).toBe(401);
    const forged = encodeSessionToken({ uid: seed.admin.id, iat: now(), exp: now() + 60 }, "a-different-secret-of-sufficient-length!!");
    expect((await callRoute(me, { headers: { Cookie: `${SESSION_COOKIE}=${forged}` } })).status).toBe(401);
  });

  it("blocks cross-origin writes made with the cookie but allows same-origin ones", async () => {
    const body = { name: "Mine", search_request: { natural_query: "SaaS companies" } };
    const cookie = sessionCookie(seed.member.id);
    const crossSite = await callRoute(saveSearch, { method: "POST", body, headers: { ...cookie, Origin: "https://evil.example" } });
    expect(crossSite.status).toBe(403);
    expect(crossSite.body.detail).toBe("Cross-origin request blocked");

    const sameSite = await callRoute(saveSearch, { method: "POST", body, headers: { ...cookie, Origin: "http://test" } });
    expect(sameSite.status).toBe(200);
    // Reads are not subject to the origin check.
    expect((await callRoute(listSaved, { headers: { ...cookie, Origin: "https://evil.example" } })).status).toBe(200);
  });

  it("ends an existing session as soon as the account is deactivated", async () => {
    const cookie = sessionCookie(seed.member.id);
    expect((await callRoute(me, { headers: cookie })).status).toBe(200);
    const res = await callRoute(updateUser, {
      method: "PATCH",
      body: { is_active: false },
      headers: await authHeaders(seed.admin),
      params: { userId: String(seed.member.id) },
    });
    expect(res.status).toBe(200);
    expect((await callRoute(me, { headers: cookie })).status).toBe(401);
  });

  it("prefers an explicit bearer token over the cookie", async () => {
    const res = await callRoute(me, { headers: { ...sessionCookie(seed.member.id), ...(await authHeaders(seed.admin)) } });
    expect(res.body.user.email).toBe("admin@acme.com");
  });
});

const NO_PROXY = new Headers();
const verifyCredentials = async (input: CredentialInput) => {
  const result = await authenticate(input, NO_PROXY);
  return result.ok ? result.account : null;
};
const MEMBER = { email: "member@acme.com", password: "member_secure_password_123" };

describe("credential verification for the sign-in form", () => {
  beforeEach(async () => {
    await seedTestData();
    signInLimiter.reset();
  });

  it("accepts valid credentials case-insensitively and audits the outcome", async () => {
    const account = await verifyCredentials({ email: "  Member@Acme.com ", password: "member_secure_password_123" });
    expect(account?.email).toBe("member@acme.com");
    expect(await verifyCredentials({ email: "member@acme.com", password: "wrong" })).toBeNull();
    expect(await verifyCredentials({ email: "nobody@acme.com", password: "whatever" })).toBeNull();
    const actions = await getDb().selectFrom("audit_events").select("action").execute();
    expect(actions.filter((a) => a.action === "LOGIN_SUCCESS")).toHaveLength(1);
    expect(actions.filter((a) => a.action === "LOGIN_FAILED")).toHaveLength(2);
  });

  it("refuses deactivated accounts even with the right password", async () => {
    await getDb().updateTable("users").set({ is_active: 0 }).where("email", "=", "member@acme.com").execute();
    expect(await verifyCredentials({ email: "member@acme.com", password: "member_secure_password_123" })).toBeNull();
  });

  it("locks an email after repeated failures, even with the right password, and audits it", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect(await authenticate({ ...MEMBER, password: "wrong" }, NO_PROXY)).toEqual({ ok: false, reason: "invalid" });
    }
    const locked = await authenticate(MEMBER, NO_PROXY);
    expect(locked).toMatchObject({ ok: false, reason: "locked" });
    expect(locked.ok === false && "retryAfterSec" in locked && locked.retryAfterSec).toBeGreaterThan(LOCKOUT_MS / 1000 - 5);

    // Other accounts are unaffected; unknown emails lock the same way (no account enumeration).
    expect((await authenticate({ email: "admin@acme.com", password: "admin_secure_password_123" }, NO_PROXY)).ok).toBe(true);
    for (let i = 0; i < MAX_FAILURES; i += 1) await authenticate({ email: "ghost@acme.com", password: "x" }, NO_PROXY);
    expect(await lockedUntil("ghost@acme.com")).not.toBeNull();

    const actions = (await getDb().selectFrom("audit_events").select("action").execute()).map((a) => a.action);
    expect(actions).toContain("LOGIN_LOCKED");
  });

  it("unlocks after the lockout and resets the count on success", async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await authenticate({ ...MEMBER, password: "wrong" }, NO_PROXY);
    await getDb().updateTable("login_lockouts").set({ locked_until: getCodec().date(new Date(Date.now() - 1000)) }).execute();
    expect((await authenticate(MEMBER, NO_PROXY)).ok).toBe(true);
    expect(await getDb().selectFrom("login_lockouts").selectAll().where("email", "=", MEMBER.email).execute()).toHaveLength(0);
  });

  it("rate-limits sign-in requests per client address and answers API clients with 429", async () => {
    const fromClient = { "X-Forwarded-For": "203.0.113.7, 10.0.0.1" };
    let last = await callRoute(apiLogin, { method: "POST", headers: fromClient, body: { email: "a@b.co", password: "x" } });
    for (let i = 0; i < 40 && last.status !== 429; i += 1) {
      last = await callRoute(apiLogin, { method: "POST", headers: fromClient, body: { email: `user${i}@b.co`, password: "x" } });
    }
    expect(last.status).toBe(429);
    expect(Number(last.response.headers.get("retry-after"))).toBeGreaterThan(0);
    // A different client is still served.
    const other = await callRoute(apiLogin, { method: "POST", headers: { "X-Forwarded-For": "198.51.100.2" }, body: MEMBER });
    expect(other.status).toBe(200);
  });
});

describe("session token encoding", () => {
  it("round-trips and parses cookies", () => {
    const token = encodeSessionToken({ uid: 7, iat: now(), exp: now() + 60 }, SECRET);
    expect(decodeSessionToken(token, SECRET)?.uid).toBe(7);
    expect(decodeSessionToken("garbage", SECRET)).toBeNull();
    expect(readCookie(`a=1; ${SESSION_COOKIE}=${encodeURIComponent(token)}; b=2`, SESSION_COOKIE)).toBe(token);
    expect(readCookie(null, SESSION_COOKIE)).toBeNull();
  });
});
