import { beforeEach, describe, expect, it } from "vitest";
import { GET as auditLog } from "@/app/api/admin/audit/route";
import { POST as refreshMetadata } from "@/app/api/admin/metadata/refresh/route";
import { GET as metadataStatus } from "@/app/api/admin/metadata/status/route";
import { PATCH as updateRelationship } from "@/app/api/admin/relationships/[relationshipId]/route";
import { GET as listRelationships } from "@/app/api/admin/relationships/route";
import { PATCH as updateColumn } from "@/app/api/admin/schema/columns/[columnId]/route";
import { GET as listColumns } from "@/app/api/admin/schema/columns/route";
import { PATCH as updateUser } from "@/app/api/admin/users/[userId]/route";
import { POST as createUser } from "@/app/api/admin/users/route";
import { POST as login } from "@/app/api/auth/login/route";
import { sanitizeAuditDetails } from "@/server/services/auditService";
import { relationshipService } from "@/server/services/relationshipDiscovery";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

describe("admin console & audit", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("reports metadata status", async () => {
    const res = await callRoute(metadataStatus, { headers: await authHeaders(seed.admin) });
    expect(res.status).toBe(200);
    expect(res.body.schema_ready).toBe(true);
    expect(res.body.database_connected).toBe(true);
    expect(res.body.tables_discovered).toBeGreaterThanOrEqual(2);
    expect(res.body.columns_discovered).toBeGreaterThanOrEqual(20);
    expect(res.body.approved_relationships_count).toBeGreaterThanOrEqual(1);
    expect(res.body.last_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lets auditors read but not mutate", async () => {
    const auditorRes = await callRoute(createUser, {
      method: "POST",
      body: { email: "auditor@acme.com", password: "auditor_password_1", full_name: "Ann Auditor", role: "AUDITOR" },
      headers: await authHeaders(seed.admin),
    });
    expect(auditorRes.status).toBe(200);
    const auditorLogin = await callRoute(login, {
      method: "POST",
      body: { email: "auditor@acme.com", password: "auditor_password_1" },
    });
    const headers = { Authorization: `Bearer ${auditorLogin.body.access_token}` };
    expect((await callRoute(listColumns, { headers })).status).toBe(200);
    expect((await callRoute(refreshMetadata, { method: "POST", headers })).status).toBe(403);
  });

  it("runs the relationship approval lifecycle", async () => {
    const headers = await authHeaders(seed.admin);
    const list = await callRoute(listRelationships, { headers });
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
    const relId = String(list.body.find((r: { status: string }) => r.status === "APPROVED").id);

    const rejected = await callRoute(updateRelationship, { method: "PATCH", body: { status: "REJECTED" }, headers, params: { relationshipId: relId } });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("REJECTED");
    expect(rejected.body.reviewed_by).toBe("admin@acme.com");
    expect(relationshipService.isJoinApproved("synthetic_contacts", "synthetic_companies")).toBe(false);

    const approved = await callRoute(updateRelationship, { method: "PATCH", body: { status: "APPROVED" }, headers, params: { relationshipId: relId } });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect(relationshipService.isJoinApproved("synthetic_contacts", "synthetic_companies")).toBe(true);

    expect((await callRoute(updateRelationship, { method: "PATCH", body: { status: "BOGUS" }, headers, params: { relationshipId: relId } })).status).toBe(422);
    expect((await callRoute(updateRelationship, { method: "PATCH", body: { status: "APPROVED" }, headers, params: { relationshipId: "9999" } })).status).toBe(404);
  });

  it("updates column policies and refreshes the validator cache", async () => {
    const headers = await authHeaders(seed.admin);
    const cols = await callRoute(listColumns, { headers });
    expect(cols.status).toBe(200);
    const target = cols.body.find((c: { table_name: string; column_name: string }) => c.table_name === "synthetic_companies" && c.column_name === "industry");

    const patched = await callRoute(updateColumn, {
      method: "PATCH",
      body: { sensitivity: "restricted", allowed_operations: ["select"] },
      headers,
      params: { columnId: String(target.id) },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.sensitivity).toBe("restricted");
    expect(patched.body.allowed_operations).toEqual(["select"]);
    expect(schemaDiscoveryService.getCachedSchema().synthetic_companies.columns.industry.sensitivity).toBe("restricted");
  });

  it("manages users within the organization", async () => {
    const headers = await authHeaders(seed.admin);
    const dup = await callRoute(createUser, {
      method: "POST",
      body: { email: "MEMBER@acme.com", password: "another_password_1", full_name: "Dup" },
      headers,
    });
    expect(dup.status).toBe(400);
    expect(dup.body.detail).toBe("Email already registered");

    const deactivated = await callRoute(updateUser, {
      method: "PATCH",
      body: { is_active: false },
      headers,
      params: { userId: String(seed.member.id) },
    });
    expect(deactivated.body).toMatchObject({ is_active: false, role: "MEMBER" });
    const blocked = await callRoute(login, { method: "POST", body: { email: "member@acme.com", password: "member_secure_password_123" } });
    expect(blocked.status).toBe(403);

    const crossTenant = await callRoute(updateUser, {
      method: "PATCH",
      body: { role: "ADMIN" },
      headers,
      params: { userId: String(seed.org2Member.id) },
    });
    expect(crossTenant.status).toBe(404);
  });

  it("records audited actions per organization", async () => {
    const headers = await authHeaders(seed.admin);
    await callRoute(createUser, {
      method: "POST",
      body: { email: "audittest@acme.com", password: "secure_password_123", full_name: "Audit Test User", role: "MEMBER" },
      headers,
    });
    const res = await callRoute(auditLog, { headers });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((e: { action: string }) => e.action === "CREATE_USER")).toBe(true);

    const otherOrg = await callRoute(auditLog, { headers: await authHeaders(seed.org2Member) });
    expect(otherOrg.status).toBe(403);
  });

  it("redacts secrets from audit details", () => {
    expect(sanitizeAuditDetails({ email: "a@b.com", password: "x", api_key: "k", download_token: "t" })).toEqual({
      email: "a@b.com",
      password: "[REDACTED]",
      api_key: "[REDACTED]",
      download_token: "[REDACTED]",
    });
    expect(sanitizeAuditDetails({})).toBeNull();
  });
});

describe("creating users in their own workspace with starting credits", () => {
  it("lets credit operators create a workspace with 499 credits by default, and nobody else", async () => {
    const { getCodec, getDb } = await import("@/server/core/database");
    const { hashPassword } = await import("@/server/core/security");
    const { toUser } = await import("@/server/models/entities");
    const { creditService } = await import("@/server/services/creditService");
    const { authHeaders, callRoute, seedTestData } = await import("./helpers");
    const seed = await seedTestData();
    const codec = getCodec();
    const operatorRow = await getDb()
      .insertInto("users")
      .values({ org_id: seed.org1.id, email: "ops@platform.example", hashed_password: await hashPassword("operator_password_1"), full_name: "Ops", role: "ADMIN", is_active: codec.bool(true), created_at: codec.date(new Date()) })
      .returningAll()
      .executeTakeFirstOrThrow();
    const operator = await authHeaders(toUser(codec, operatorRow));
    const base = { password: "customer_password_1", full_name: "Jane Doe", role: "ADMIN" };

    const created = await callRoute(createUser, { method: "POST", headers: operator, body: { ...base, email: "jane@northwind.example", workspace_name: "Northwind" } });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ email: "jane@northwind.example", role: "ADMIN", credits_granted: 499, balance: 499, workspace: { name: "Northwind", slug: "northwind" } });
    const orgId = created.body.workspace.id;
    expect(orgId).not.toBe(seed.org1.id);
    expect(await creditService.balance(orgId)).toBe(499);
    expect((await creditService.history(orgId))[0]).toMatchObject({ delta: 499, reason: "grant" });

    // A custom amount, and a unique slug for a second workspace with the same name.
    const second = await callRoute(createUser, { method: "POST", headers: operator, body: { ...base, email: "raj@northwind2.example", workspace_name: "Northwind", starting_credits: 1200 } });
    expect(second.body).toMatchObject({ credits_granted: 1200, workspace: { slug: "northwind-2" } });

    // Workspace admins who aren't operators: own workspace only, no credits.
    const admin = await authHeaders(seed.admin);
    expect((await callRoute(createUser, { method: "POST", headers: admin, body: { ...base, email: "x@y.example", workspace_name: "Mine" } })).status).toBe(403);
    expect((await callRoute(createUser, { method: "POST", headers: operator, body: { ...base, email: "z@y.example", starting_credits: 10 } })).status).toBe(422);
    const plain = await callRoute(createUser, { method: "POST", headers: admin, body: { ...base, email: "teammate@acme.com", role: "MEMBER" } });
    expect(plain.body).toMatchObject({ org_id: seed.org1.id, workspace: null, credits_granted: 0 });
  });
});
