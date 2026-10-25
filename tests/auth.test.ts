import { beforeEach, describe, expect, it } from "vitest";
import { POST as bootstrap } from "@/app/api/auth/bootstrap/route";
import { GET as bootstrapStatus } from "@/app/api/auth/bootstrap/status/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listUsers } from "@/app/api/admin/users/route";
import { GET as listSaved } from "@/app/api/search/saved/route";
import { createAccessToken, decodeAccessToken, hashPassword, verifyPassword } from "@/server/core/security";
import { authHeaders, callRoute, resetDatabase, seedTestData, type SeedData } from "./helpers";

// Hash produced by Python's argon2-cffi PasswordHasher().hash("S3cret!pw").
const PYTHON_ARGON2_HASH = "$argon2id$v=19$m=65536,t=3,p=4$IxNrn/LKWcrCKQya15DE/w$LmAn2KZmu5sQCUeYfRrZ2LwOBlBjw75gyC49K7t3eKg";

describe("authentication & RBAC", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("logs in with valid credentials", async () => {
    const res = await callRoute(login, {
      method: "POST",
      body: { email: "admin@acme.com", password: "admin_secure_password_123" },
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.token_type).toBe("bearer");
    expect(res.body.user.email).toBe("admin@acme.com");
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.user).not.toHaveProperty("hashed_password");
  });

  it("rejects an invalid password", async () => {
    const res = await callRoute(login, { method: "POST", body: { email: "admin@acme.com", password: "wrong_password" } });
    expect(res.status).toBe(401);
    expect(res.body.detail).toContain("Incorrect email or password");
    expect(res.response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("rejects unknown users with the same message", async () => {
    const res = await callRoute(login, { method: "POST", body: { email: "ghost@acme.com", password: "whatever_123" } });
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe("Incorrect email or password");
  });

  it("validates the login payload", async () => {
    const res = await callRoute(login, { method: "POST", body: { email: "not-an-email", password: "x" } });
    expect(res.status).toBe(422);
  });

  it("blocks unauthenticated access", async () => {
    const res = await callRoute(listSaved);
    expect(res.status).toBe(401);
    expect(res.body.detail).toBe("Authentication required");
  });

  it("rejects tampered tokens", async () => {
    const headers = await authHeaders(seed.member);
    const res = await callRoute(listSaved, { headers: { Authorization: `${headers.Authorization}x` } });
    expect(res.status).toBe(401);
  });

  it("blocks members from admin endpoints", async () => {
    const res = await callRoute(listUsers, { headers: await authHeaders(seed.member) });
    expect(res.status).toBe(403);
    expect(res.body.detail).toBe("Operation requires one of the following roles: ['ADMIN']");
  });

  it("allows admins on admin endpoints", async () => {
    const res = await callRoute(listUsers, { headers: await authHeaders(seed.admin) });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("returns the current user and organization", async () => {
    const res = await callRoute(me, { headers: await authHeaders(seed.member) });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("member@acme.com");
    expect(res.body.organization).toEqual({ id: seed.org1.id, name: "Acme Corporation", slug: "acme" });
  });

  it("blocks bootstrap when an admin exists", async () => {
    const res = await callRoute(bootstrap, {
      method: "POST",
      body: {
        admin_email: "newadmin@example.com",
        admin_password: "new_password_123",
        admin_name: "New Admin",
        org_name: "New Org",
        org_slug: "new-org",
      },
    });
    expect(res.status).toBe(403);
    expect(res.body.detail).toContain("already bootstrapped");
  });
});

describe("initial administrator bootstrap", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("bootstraps exactly once", async () => {
    expect((await callRoute(bootstrapStatus)).body).toEqual({ bootstrapped: false });
    const payload = {
      admin_email: "Root@Example.com",
      admin_password: "very_secure_password",
      admin_name: "Root Admin",
      org_name: "Example Org",
      org_slug: "example",
    };
    const res = await callRoute(bootstrap, { method: "POST", body: payload });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "root@example.com", role: "ADMIN", is_active: true });
    expect((await callRoute(bootstrapStatus)).body).toEqual({ bootstrapped: true });
    expect((await callRoute(bootstrap, { method: "POST", body: payload })).status).toBe(403);
  });

  it("rejects short bootstrap passwords", async () => {
    const res = await callRoute(bootstrap, {
      method: "POST",
      body: { admin_email: "a@b.com", admin_password: "short", admin_name: "A", org_name: "O", org_slug: "o" },
    });
    expect(res.status).toBe(422);
  });
});

describe("security primitives", () => {
  it("verifies Argon2id hashes produced by the Python service", async () => {
    expect(await verifyPassword("S3cret!pw", PYTHON_ARGON2_HASH)).toBe(true);
    expect(await verifyPassword("s3cret!pw", PYTHON_ARGON2_HASH)).toBe(false);
    const fresh = await hashPassword("S3cret!pw");
    expect(fresh).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    expect(await verifyPassword("S3cret!pw", fresh)).toBe(true);
    expect(await verifyPassword("wrong", fresh)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("issues tokens with the Python claim layout", async () => {
    const token = await createAccessToken({ sub: "7", org_id: 3, role: "MEMBER" });
    const claims = await decodeAccessToken(token);
    expect(claims).toMatchObject({ sub: "7", org_id: 3, role: "MEMBER" });
    expect(typeof claims.exp).toBe("number");
    expect(typeof claims.iat).toBe("number");
    await expect(decodeAccessToken(await createAccessToken({ sub: "7", org_id: 3, role: "MEMBER" }, -1))).rejects.toMatchObject({
      status: 401,
    });
  });
});
