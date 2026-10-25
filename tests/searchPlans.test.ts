import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as updateColumn } from "@/app/api/admin/schema/columns/[columnId]/route";
import { getDb } from "@/server/core/database";
import type { SQLReviewerOutput } from "@/server/schemas/agent";
import { searchRequestSchema } from "@/server/schemas/search";
import { analyzeSql, rewriteOuterLimit } from "@/server/services/clickhouseSql";
import { chService } from "@/server/services/clickhouseClient";
import { applyExportLimit, exportService } from "@/server/services/exportService";
import { entityMismatch, missingStructuredFilters, searchOrchestrator } from "@/server/services/searchOrchestrator";
import { searchPlanCache } from "@/server/services/searchPlanCache";
import { sqlGeneratorAgent } from "@/server/services/sqlGeneratorAgent";
import { sqlReviewerAgent } from "@/server/services/sqlReviewerAgent";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

const request = (input: Record<string, unknown>) => searchRequestSchema.parse(input);

describe("outer LIMIT rewriting", () => {
  it("changes only the outer query's limit", () => {
    const sql = "SELECT a FROM t WHERE id IN (SELECT id FROM u LIMIT 5) ORDER BY a, id LIMIT 25 OFFSET 0";
    expect(rewriteOuterLimit(sql, 100, 200)).toBe("SELECT a FROM t WHERE id IN (SELECT id FROM u LIMIT 5) ORDER BY a, id LIMIT 100 OFFSET 200");
    expect(rewriteOuterLimit("SELECT a FROM t LIMIT 0, 10", 50, 0)).toBe("SELECT a FROM t LIMIT 50");
    expect(rewriteOuterLimit("SELECT a FROM t ORDER BY a", 10, 30)).toBe("SELECT a FROM t ORDER BY a LIMIT 10 OFFSET 30");
    expect(rewriteOuterLimit("SELECT a FROM t LIMIT 1 BY b LIMIT 20", 5, 0)).toBe("SELECT a FROM t LIMIT 1 BY b LIMIT 5");
    expect(applyExportLimit(sql, 1000)).toBe("SELECT a FROM t WHERE id IN (SELECT id FROM u LIMIT 5) ORDER BY a, id LIMIT 1000");
    expect(analyzeSql(sql).hasOrderBy).toBe(true);
    expect(analyzeSql("SELECT a FROM t WHERE id IN (SELECT id FROM u ORDER BY id LIMIT 5) LIMIT 5").hasOrderBy).toBe(false);
  });
});

describe("approved search plans", () => {
  let seed: SeedData;
  beforeEach(async () => {
    vi.restoreAllMocks();
    searchPlanCache.clear();
    seed = await seedTestData();
  });

  it("serves later pages and exports from the approved plan without the LLM agents", async () => {
    const generate = vi.spyOn(sqlGeneratorAgent, "generateSql");
    const review = vi.spyOn(sqlReviewerAgent, "reviewSql");
    const executed: string[] = [];
    const original = chService.executeQuery.bind(chService);
    vi.spyOn(chService, "executeQuery").mockImplementation(async (sql, params, timeout) => {
      executed.push(sql);
      return original(sql, params, timeout);
    });

    const page1 = await searchOrchestrator.executeSearchFlow(request({ natural_query: "SaaS companies in Germany", page: 1, page_size: 10 }), "ADMIN");
    const page2 = await searchOrchestrator.executeSearchFlow(request({ natural_query: "  saas companies in GERMANY ", page: 2, page_size: 10 }), "ADMIN");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
    expect(page1.diagnostic?.generated_sql).toMatch(/LIMIT 10$/);
    expect(page2.diagnostic?.generated_sql).toMatch(/LIMIT 10 OFFSET 10$/);
    expect(page2.diagnostic?.reviewer_reasoning).toMatch(/^Reused the plan/);
    expect(page2.total_distinct_count).toBe(page1.total_distinct_count);
    // The count runs once; page 2 reuses it.
    expect(executed.filter((sql) => sql.includes("count(")).length).toBe(1);

    const job = await exportService.createExportJob(request({ natural_query: "SaaS companies in Germany" }), seed.admin.id, seed.admin.org_id, "ADMIN", 50);
    await exportService.drain();
    expect((await exportService.getJobByToken(job.download_token!))?.status).toBe("COMPLETED");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps plans per role and drops a plan that no longer passes validation", async () => {
    const generate = vi.spyOn(sqlGeneratorAgent, "generateSql");
    await searchOrchestrator.executeSearchFlow(request({ natural_query: "SaaS companies" }), "MEMBER");
    await searchOrchestrator.executeSearchFlow(request({ natural_query: "SaaS companies" }), "ADMIN");
    expect(generate).toHaveBeenCalledTimes(2); // different roles, different plans

    // An administrator restricts a column the cached plan selects: the plan must not be reused.
    const column = await getDb()
      .selectFrom("discovered_schemas")
      .select("id")
      .where("table_name", "=", "synthetic_companies")
      .where("column_name", "=", "domain")
      .executeTakeFirstOrThrow();
    await callRoute(updateColumn, { method: "PATCH", body: { sensitivity: "restricted" }, headers: await authHeaders(seed.admin), params: { columnId: String(column.id) } });
    await expect(searchOrchestrator.executeSearchFlow(request({ natural_query: "SaaS companies", page: 2 }), "MEMBER")).rejects.toThrow(
      /Access denied: Column 'domain'/,
    );
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("gives the generator the reviewer's findings when it retries", async () => {
    const generate = vi.spyOn(sqlGeneratorAgent, "generateSql");
    const missing: SQLReviewerOutput = {
      verdict: "REJECTED",
      satisfies_request: false,
      schema_matched: true,
      joins_approved: true,
      security_passed: true,
      is_read_only: true,
      has_correct_grain: true,
      issues: ["Missing criterion: marketing roles (JOB_FUNCTION_PER = 'Advertising & Marketing')"],
      reasoning: "The marketing criterion is not applied.",
      clarification_question: null,
    };
    const original = sqlReviewerAgent.reviewSql.bind(sqlReviewerAgent);
    vi.spyOn(sqlReviewerAgent, "reviewSql").mockResolvedValueOnce(missing).mockImplementation(original);

    const result = await searchOrchestrator.executeSearchFlow(request({ natural_query: "marketing leaders at SaaS companies" }), "ADMIN");
    expect(result.diagnostic?.repair_attempts).toBe(1);
    expect(generate.mock.calls[0][2]).toBeNull();
    expect(generate.mock.calls[1][2]).toContain("Missing criterion: marketing roles");
  });
});

describe("result entity check", () => {
  const base = { search_target: "contact", clickhouse_sql: "SELECT RBID_PER AS contact_id FROM new_combined_data", count_sql: "", parameters: {}, target_tables: [], required_joins: [], selected_fields: [], assumptions: [], unresolved_ambiguities: [], notes: null };
  const contactRep = { search_target: "contact" } as Parameters<typeof entityMismatch>[0];

  it("accepts people for a contact search and rejects company rows", () => {
    expect(entityMismatch(contactRep, base as Parameters<typeof entityMismatch>[1])).toBeNull();
    const companies = { ...base, search_target: "company", clickhouse_sql: "SELECT RBID_ORG AS company_id, COMPANY_NAME_ORG FROM new_company_data" };
    expect(entityMismatch(contactRep, companies as Parameters<typeof entityMismatch>[1])).toMatch(/searching for contacts/);
  });
});

describe("applied filter check", () => {
  const filters = [
    { field: "new_combined_data.JOB_LEVEL_PER", operator: "in" as const, value: ["VP", "Director"] },
    { field: "new_combined_data.JOB_TITLE_PER", operator: "contains" as const, value: ["VP Sales", "Vice President of Sales"] },
    { field: "new_combined_data.LINKEDIN_URL_PER", operator: "not_empty" as const, value: true },
    { field: "industry", operator: "in" as const, value: ["Fintech"] }, // an ICP hint, not checked literally
  ];

  it("passes a query that applies every filter", () => {
    const sql = `SELECT RBID_PER AS contact_id FROM new_combined_data WHERE JOB_LEVEL_PER IN ('VP','Director')
      AND (ilike(JOB_TITLE_PER, '%vp sales%') OR ilike(JOB_TITLE_PER, '%Vice President of Sales%')) AND notEmpty(LINKEDIN_URL_PER)`;
    expect(missingStructuredFilters(filters, sql)).toEqual([]);
  });

  it("names each filter or value the query leaves out", () => {
    const sql = "SELECT RBID_PER AS contact_id FROM new_combined_data WHERE JOB_LEVEL_PER IN ('VP') AND ilike(JOB_TITLE_PER, '%VP Sales%')";
    expect(missingStructuredFilters(filters, sql)).toEqual([
      "JOB_LEVEL_PER in 'Director'",
      "JOB_TITLE_PER contains 'Vice President of Sales'",
      'LINKEDIN_URL_PER (not_empty true)',
    ]);
  });
});

describe("applied filter check, strict", () => {
  it("rejects a filter whose column only appears in the selected columns, or whose value sits on another column", () => {
    const filters = [{ field: "new_combined_data.JOB_TITLE_PER", operator: "contains" as const, value: ["Founder", "CEO"] }];
    const swapped = "SELECT JOB_TITLE_PER, PERSONA_PER FROM new_combined_data WHERE PERSONA_PER = 'CEO / Founder' AND IS_HIRING = 1";
    expect(missingStructuredFilters(filters, swapped)).toEqual(["JOB_TITLE_PER (contains [\"Founder\",\"CEO\"])"]);
    const exact = "SELECT JOB_TITLE_PER FROM new_combined_data WHERE (ilike(JOB_TITLE_PER, '%Founder%') OR ilike(JOB_TITLE_PER, '%CEO%')) AND IS_HIRING = 1";
    expect(missingStructuredFilters(filters, exact)).toEqual([]);
  });
});
