import { beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyViolationError } from "@/server/core/errors";
import { parseFencedJson } from "@/server/schemas/agent";
import { searchRequestSchema } from "@/server/schemas/search";
import { llmAdapter } from "@/server/services/llmAdapter";
import { chService } from "@/server/services/clickhouseClient";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";
import { sqlGeneratorAgent } from "@/server/services/sqlGeneratorAgent";
import { sqlReviewerAgent } from "@/server/services/sqlReviewerAgent";
import { seedTestData } from "./helpers";

const request = (input: Record<string, unknown>) => searchRequestSchema.parse(input);

describe("two-agent workflow", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await seedTestData();
  });

  it("generates and approves a company search", async () => {
    const req = request({
      natural_query: "Find SaaS companies in United States with more than 100 employees using React",
      search_target: "company",
    });
    const rep = searchOrchestrator.buildIntermediateRepresentation(req, "MEMBER");
    const gen = await sqlGeneratorAgent.generateSql(rep, req.natural_query);
    expect(gen.clickhouse_sql).toContain("synthetic_companies");
    expect(gen.clickhouse_sql).toContain("has(c.technologies, 'React')");
    expect(gen.search_target).toBe("company");

    const review = await sqlReviewerAgent.reviewSql(rep, gen, req.natural_query);
    expect(review.verdict).toBe("APPROVED");
    expect(review.is_read_only).toBe(true);
    expect(review.security_passed).toBe(true);
  });

  it("rejects queries against unapproved tables", async () => {
    const req = request({ natural_query: "Fetch raw unapproved events data", search_target: "company" });
    const rep = searchOrchestrator.buildIntermediateRepresentation(req, "MEMBER");
    const gen = await sqlGeneratorAgent.generateSql(rep, req.natural_query);
    const review = await sqlReviewerAgent.reviewSql(rep, gen, req.natural_query);
    expect(review.verdict).toBe("REJECTED");
    expect(review.security_passed).toBe(false);
    await expect(searchOrchestrator.executeSearchFlow(req, "MEMBER")).rejects.toBeInstanceOf(PolicyViolationError);
  });

  it("asks for clarification on ambiguous queries", async () => {
    const result = await searchOrchestrator.executeSearchFlow(request({ natural_query: "leads", search_target: "company" }), "MEMBER");
    expect(result.clarification_required).toBe(true);
    expect(result.clarification_message).toBeTruthy();
    expect(result.records).toHaveLength(0);
  });

  it("builds the intermediate representation from structured ICP filters", () => {
    const rep = searchOrchestrator.buildIntermediateRepresentation(
      request({
        search_target: "contact",
        structured_icp: {
          industry: ["Fintech"],
          min_employees: 50,
          max_employees: 600,
          min_revenue: 5_000_000,
          technologies: ["React", "AWS"],
          job_title: "VP",
          email: "a@b.com",
        },
      }),
      "ADMIN",
    );
    expect(rep.filters).toEqual([
      { field: "industry", operator: "in", value: ["Fintech"] },
      { field: "EMPLOYEE_COUNT_RANGE_ORG", operator: "in", value: ["11 to 50", "51 to 200", "201 to 500", "501 to 1000"] },
      {
        field: "REVENUE_RANGE_ORG",
        operator: "in",
        value: ["$1M to <$10M", "$10M to <$50M", "$50M to <$100M", "$100M to <$1B", "$1B+"],
      },
      { field: "technologies", operator: "has", value: "React" },
      { field: "technologies", operator: "has", value: "AWS" },
      { field: "job_title", operator: "contains", value: "VP" },
      { field: "work_email", operator: "eq", value: "a@b.com" },
    ]);
    expect(rep.required_entity_identifiers).toEqual(["contact_id", "RBID_PER"]);
    expect(rep.user_role).toBe("ADMIN");
  });

  it("retries recoverable execution errors at most twice", async () => {
    const generate = vi.spyOn(sqlGeneratorAgent, "generateSql");
    vi.spyOn(chService, "executeQuery").mockRejectedValue(new Error("Code: 47. Unknown identifier"));
    await expect(
      searchOrchestrator.executeSearchFlow(request({ natural_query: "SaaS companies in Germany" }), "MEMBER"),
    ).rejects.toThrow(/failed after 2 bounded repair attempts. Last error: ClickHouse database error: Code: 47/);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("does not retry deterministic policy violations", async () => {
    const generate = vi.spyOn(sqlGeneratorAgent, "generateSql").mockResolvedValue({
      clickhouse_sql: "SELECT c.company_id, c.confidential_arr FROM leadgen_warehouse.synthetic_companies AS c LIMIT 10",
      count_sql: null,
      parameters: {},
      search_target: "company",
      target_tables: [],
      required_joins: [],
      selected_fields: [],
      assumptions: [],
      unresolved_ambiguities: [],
      notes: null,
    });
    // The mock reviewer only flags restricted columns for MEMBER; AUDITOR reaches the validator.
    await expect(searchOrchestrator.executeSearchFlow(request({ natural_query: "companies" }), "AUDITOR")).rejects.toThrow(
      /Deterministic policy violation: Access denied: Column 'confidential_arr'/,
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("treats unparseable reviewer output as a rejection", async () => {
    vi.spyOn(llmAdapter, "generateCompletion").mockResolvedValue("not json");
    const req = request({ natural_query: "companies" });
    const rep = searchOrchestrator.buildIntermediateRepresentation(req);
    const review = await sqlReviewerAgent.reviewSql(
      rep,
      {
        clickhouse_sql: "SELECT 1",
        count_sql: null,
        parameters: {},
        search_target: "company",
        target_tables: [],
        required_joins: [],
        selected_fields: [],
        assumptions: [],
        unresolved_ambiguities: [],
        notes: null,
      },
      null,
    );
    expect(review.verdict).toBe("REJECTED");
    expect(review.issues).toEqual(["Reviewer structured response parsing error"]);
    await expect(sqlGeneratorAgent.generateSql(rep, null)).rejects.toThrow(/Generator output was malformed/);
  });

  it("parses fenced JSON responses", () => {
    expect(parseFencedJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseFencedJson('  {"b": 2} ')).toEqual({ b: 2 });
  });
});
