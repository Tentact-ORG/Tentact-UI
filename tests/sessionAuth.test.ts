import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as updateUser } from "@/app/api/admin/users/[userId]/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listSaved, POST as saveSearch } from "@/app/api/search/saved/route";
import { verifyCredentials } from "@/server/auth/credentials";
import { decodeSessionToken, encodeSessionToken, readCookie, SESSION_COOKIE } from "@/server/auth/token";
import { getDb } from "@/server/core/database";
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

describe("credential verification for the sign-in form", () => {
  beforeEach(async () => {
    await seedTestData();
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
