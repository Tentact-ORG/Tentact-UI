import { sql } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteList } from "@/app/api/lists/[listId]/route";
import { GET as listLists, POST as createList } from "@/app/api/lists/route";
import { GET as columnValues } from "@/app/api/search/metadata/values/route";
import { GET as listSaved, POST as saveSearch } from "@/app/api/search/saved/route";
import { getDb, migrateDatabase } from "@/server/core/database";
import { MAX_LIST_ITEMS, type ProspectSnapshot } from "@/server/schemas/lists";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

function prospect(id: string): ProspectSnapshot {
  return {
    id,
    firstName: "Maya",
    lastName: "Rao",
    title: "VP Marketing",
    seniority: "VP",
    department: "Advertising & Marketing",
    jobFunction: "CMO / Marketing Executive",
    city: "Austin",
    country: "United States",
    email: "maya@example.com",
    phone: null,
    linkedinUrl: "https://linkedin.com/in/maya",
    verifiedEmail: true,
    directDial: false,
    jobChangeDays: 40,
    sources: ["LinkedIn"],
    company: {
      id: "rb-1",
      name: "Northwind",
      industry: "Software Development",
      employees: "201 to 500",
      revenue: "$10M to <$50M",
      headquarters: "United States",
      website: "https://northwind.example",
      technologies: [],
      hiring: [],
      funding: "Series B",
      intent: null,
    },
  };
}

describe("prospect lists API", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("creates, lists, isolates and deletes lists", async () => {
    const headers = await authHeaders(seed.member);
    const created = await callRoute(createList, {
      method: "POST",
      body: { name: "Q4 targets", prospects: [prospect("p1"), prospect("p2")] },
      headers,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ name: "Q4 targets", prospect_count: 2 });
    expect(created.body.prospects[1].id).toBe("p2");
    const listId = String(created.body.id);

    const mine = await callRoute(listLists, { headers });
    expect(mine.body.map((l: { id: number }) => l.id)).toEqual([created.body.id]);

    const otherOrg = await authHeaders(seed.org2Member);
    expect((await callRoute(listLists, { headers: otherOrg })).body).toEqual([]);
    expect((await callRoute(deleteList, { method: "DELETE", headers: otherOrg, params: { listId } })).status).toBe(404);

    expect((await callRoute(deleteList, { method: "DELETE", headers, params: { listId } })).body).toEqual({ status: "deleted", id: Number(listId) });
    expect((await callRoute(listLists, { headers })).body).toEqual([]);
  });

  it("validates list payloads", async () => {
    const headers = await authHeaders(seed.member);
    expect((await callRoute(createList, { method: "POST", body: { name: "Empty", prospects: [] }, headers })).status).toBe(422);
    const malformed = { ...prospect("p1"), verifiedEmail: "yes" };
    expect((await callRoute(createList, { method: "POST", body: { name: "Bad", prospects: [malformed] }, headers })).status).toBe(422);
    const tooMany = Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => prospect(`p${i}`));
    expect((await callRoute(createList, { method: "POST", body: { name: "Huge", prospects: tooMany }, headers })).status).toBe(422);
    expect((await callRoute(createList, { method: "POST", body: { name: "x", prospects: [prospect("p")] } })).status).toBe(401);
  });
});

describe("saved search ui_state", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("round-trips the dashboard filter state", async () => {
    const headers = await authHeaders(seed.member);
    const ui_state = { query: "vp marketing", seniorities: ["VP"], verifiedEmail: true };
    const created = await callRoute(saveSearch, {
      method: "POST",
      body: { name: "VPs", search_request: { natural_query: "vp marketing", search_target: "contact" }, ui_state },
      headers,
    });
    expect(created.status).toBe(200);
    const listed = await callRoute(listSaved, { headers });
    expect(listed.body[0].ui_state).toEqual(ui_state);

    const huge = { blob: "x".repeat(25_000) };
    expect((await callRoute(saveSearch, { method: "POST", body: { name: "Big", search_request: {}, ui_state: huge }, headers })).status).toBe(422);
  });

  it("adds ui_state to a saved_searches table created by the Python service", async () => {
    const db = getDb();
    await db.schema.dropTable("saved_searches").execute();
    await sql`CREATE TABLE saved_searches (
      id INTEGER NOT NULL PRIMARY KEY, org_id INTEGER NOT NULL, user_id INTEGER NOT NULL, name VARCHAR(255) NOT NULL,
      description TEXT, natural_query TEXT, structured_icp JSON NOT NULL, intermediate_rep JSON NOT NULL, created_at DATETIME NOT NULL)`.execute(db);
    await sql`INSERT INTO saved_searches VALUES (1, ${seed.org1.id}, ${seed.member.id}, 'Legacy', NULL, 'saas', '{}', '{}', '2026-10-18 11:22:29.534839')`.execute(db);

    await migrateDatabase();
    const listed = await callRoute(listSaved, { headers: await authHeaders(seed.member) });
    expect(listed.body).toEqual([expect.objectContaining({ id: 1, name: "Legacy", natural_query: "saas", ui_state: null })]);
  });
});

describe("column values for filter options", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
    await valueDiscoveryService.refreshAllValues();
  });

  it("returns discovered values and respects column sensitivity", async () => {
    const keys = "synthetic_companies.industry,synthetic_companies.confidential_arr,synthetic_raw_events.event_type,synthetic_contacts.work_email";
    const member = await callRoute(columnValues, { path: `/api/search/metadata/values?keys=${keys}`, headers: await authHeaders(seed.member) });
    expect(member.status).toBe(200);
    expect(member.body["synthetic_companies.industry"].values.length).toBeGreaterThan(0);
    expect(member.body).not.toHaveProperty(["synthetic_companies.confidential_arr"]); // restricted
    expect(member.body).not.toHaveProperty(["synthetic_raw_events.event_type"]); // unapproved table
    expect(member.body["synthetic_contacts.work_email"]).toEqual({ values: null, empty: false, complete: false }); // PII, not enumerated

    const admin = await callRoute(columnValues, { path: `/api/search/metadata/values?keys=${keys}`, headers: await authHeaders(seed.admin) });
    expect(admin.body).toHaveProperty(["synthetic_companies.confidential_arr"]);
  });

  it("validates the keys parameter", async () => {
    const headers = await authHeaders(seed.member);
    expect((await callRoute(columnValues, { path: "/api/search/metadata/values", headers })).status).toBe(422);
    expect((await callRoute(columnValues, { path: "/api/search/metadata/values?keys=a.b;drop", headers })).status).toBe(422);
  });
});

describe("GET /api/search/metadata/suggest", () => {
  it("only serves signed-in users, allowed columns and sensible input", async () => {
    const { GET: suggest } = await import("@/app/api/search/metadata/suggest/route");
    const seed = await seedTestData();
    const headers = await authHeaders(seed.member);
    const call = (q: string, key = "new_combined_data.JOB_TITLE_PER", h: Record<string, string> | undefined = headers) =>
      callRoute(suggest, { path: `/api/search/metadata/suggest?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}`, headers: h });
    expect((await call("engineer", undefined, {})).status).toBe(401);
    expect((await call("engineer", "new_combined_data.EMAIL_ADDRESS_PER")).status).toBe(422);
    expect((await call("e")).status).toBe(422);
    expect((await call("x".repeat(61))).status).toBe(422);
  });
});
