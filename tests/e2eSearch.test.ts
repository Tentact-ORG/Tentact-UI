import { beforeEach, describe, expect, it } from "vitest";
import { GET as live } from "@/app/api/health/live/route";
import { GET as ready } from "@/app/api/health/ready/route";
import { POST as search } from "@/app/api/search/route";
import { GET as filterOptions } from "@/app/api/search/metadata/filters/route";
import { DELETE as deleteSaved } from "@/app/api/search/saved/[savedId]/route";
import { GET as listSaved, POST as saveSearch } from "@/app/api/search/saved/route";
import { getDb } from "@/server/core/database";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

describe("end-to-end search", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("runs a company search for a member without diagnostics", async () => {
    const res = await callRoute(search, {
      method: "POST",
      body: {
        natural_query: "Find Fintech companies in United States with more than 50 employees",
        structured_icp: { industry: ["Fintech"], country: ["United States"], min_employees: 50 },
        search_target: "company",
        page: 1,
        page_size: 10,
      },
      headers: await authHeaders(seed.member),
    });
    expect(res.status).toBe(200);
    expect(res.body.search_target).toBe("company");
    expect(res.body.total_distinct_count).toBeGreaterThan(0);
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.diagnostic).toBeNull();
    expect(res.body.clarification_message).toBeNull();
    expect(res.body.applied_filters[0]).toEqual({ field: "industry", operator: "in", value: ["Fintech"] });

    const audit = await getDb().selectFrom("audit_events").select(["action", "user_id"]).where("action", "=", "EXECUTE_SEARCH").execute();
    expect(audit).toEqual([{ action: "EXECUTE_SEARCH", user_id: seed.member.id }]);
  });

  it("runs a contact search through the approved join", async () => {
    const res = await callRoute(search, {
      method: "POST",
      body: { natural_query: "Find VP of Engineering or CTO contacts in SaaS companies", search_target: "contact", page: 1, page_size: 10 },
      headers: await authHeaders(seed.member),
    });
    expect(res.status).toBe(200);
    expect(res.body.search_target).toBe("contact");
    expect(res.body.total_distinct_count).toBeGreaterThan(0);
    expect(res.body.records.length).toBeGreaterThan(0);
    expect(res.body.records[0]).toHaveProperty("contact_id");
    expect(res.body.records[0]).toHaveProperty("job_title");
    expect(res.body.records[0]).toHaveProperty("work_email");
  });

  it("exposes diagnostics to admins", async () => {
    const res = await callRoute(search, {
      method: "POST",
      body: { natural_query: "Fintech companies in Germany", search_target: "company" },
      headers: await authHeaders(seed.admin),
    });
    expect(res.status).toBe(200);
    expect(res.body.diagnostic.generated_sql).toContain("c.country = 'Germany'");
    expect(res.body.diagnostic.reviewer_verdict).toBe("APPROVED");
    expect(res.body.diagnostic.validation_status).toBe("PASSED");
    expect(res.body.diagnostic.repair_attempts).toBe(0);
  });

  it("maps security rejections to 403 and validates input", async () => {
    const headers = await authHeaders(seed.member);
    const blocked = await callRoute(search, { method: "POST", body: { natural_query: "show unapproved raw events" }, headers });
    expect(blocked.status).toBe(403);
    expect(blocked.body.detail).toContain("Query rejected by security review");

    expect((await callRoute(search, { method: "POST", body: { page_size: 500 }, headers })).status).toBe(422);
    expect((await callRoute(search, { method: "POST", body: { natural_query: "x" } })).status).toBe(401);
  });

  it("manages saved searches with organization isolation", async () => {
    const memberHeaders = await authHeaders(seed.member);
    const created = await callRoute(saveSearch, {
      method: "POST",
      body: {
        name: "Target SaaS Accounts",
        description: "Mid-market SaaS in US",
        search_request: { natural_query: "SaaS companies in US", search_target: "company", structured_icp: { industry: ["SaaS"] } },
      },
      headers: memberHeaders,
    });
    expect(created.status).toBe(200);
    expect(Object.keys(created.body).sort()).toEqual(["created_at", "description", "id", "name"]);
    const savedId = created.body.id as number;

    const list = await callRoute(listSaved, { headers: memberHeaders });
    const saved = list.body.find((s: { id: number }) => s.id === savedId);
    expect(saved.natural_query).toBe("SaaS companies in US");
    expect(saved.structured_icp.industry).toEqual(["SaaS"]);

    const otherOrg = await callRoute(listSaved, { headers: await authHeaders(seed.org2Member) });
    expect(otherOrg.body.every((s: { id: number }) => s.id !== savedId)).toBe(true);

    const crossDelete = await callRoute(deleteSaved, {
      method: "DELETE",
      headers: await authHeaders(seed.org2Member),
      params: { savedId: String(savedId) },
    });
    expect(crossDelete.status).toBe(404);

    const deleted = await callRoute(deleteSaved, { method: "DELETE", headers: memberHeaders, params: { savedId: String(savedId) } });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ status: "deleted", id: savedId });
    expect((await callRoute(deleteSaved, { method: "DELETE", headers: memberHeaders, params: { savedId: "abc" } })).status).toBe(422);
  });

  it("serves filter options and health endpoints", async () => {
    const options = await callRoute(filterOptions, { headers: await authHeaders(seed.member) });
    expect(options.status).toBe(200);
    expect(Object.keys(options.body).sort()).toEqual([
      "countries",
      "employee_range",
      "funding_stages",
      "industries",
      "job_titles",
      "revenue_range",
      "technologies",
    ]);
    expect(options.body.employee_range).toEqual({ min: 1, max: 10000 });

    expect((await callRoute(live)).body).toEqual({ status: "alive" });
    const health = await callRoute(ready);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ status: "ready", search_capable: true, components: { app_database: "connected" } });
  });
});
