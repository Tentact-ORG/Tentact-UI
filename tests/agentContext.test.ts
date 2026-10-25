import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "@/server/core/config";
import type { SQLGeneratorOutput } from "@/server/schemas/agent";
import { searchRequestSchema } from "@/server/schemas/search";
import { llmAdapter } from "@/server/services/llmAdapter";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";
import { sqlGeneratorAgent } from "@/server/services/sqlGeneratorAgent";
import { sqlReviewerAgent } from "@/server/services/sqlReviewerAgent";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";
import { seedTestData } from "./helpers";

const DB = "leadgen_warehouse";

function generated(sql: string): SQLGeneratorOutput {
  return {
    clickhouse_sql: sql,
    count_sql: null,
    parameters: {},
    search_target: "company",
    target_tables: [`${DB}.synthetic_companies`],
    required_joins: [],
    selected_fields: [],
    assumptions: [],
    unresolved_ambiguities: [],
    notes: null,
  };
}

describe("context given to the agents", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await seedTestData();
  });

  it("gives the reviewer the deterministic access-control verdict for the exact query and role", async () => {
    const spy = vi.spyOn(llmAdapter, "generateCompletion");
    const rep = searchOrchestrator.buildIntermediateRepresentation(searchRequestSchema.parse({ natural_query: "companies" }), "MEMBER");

    await sqlReviewerAgent.reviewSql(rep, generated(`SELECT c.company_id, c.name FROM ${DB}.synthetic_companies AS c LIMIT 5`), null);
    expect(spy.mock.calls[0][1]).toContain("Deterministic access-control check: PASSED");
    expect(spy.mock.calls[0][4]).toBe("reviewer");

    await sqlReviewerAgent.reviewSql(rep, generated(`SELECT c.company_id, c.confidential_arr FROM ${DB}.synthetic_companies AS c LIMIT 5`), null);
    expect(spy.mock.calls[1][1]).toMatch(/Deterministic access-control check: FAILED: Access denied: Column 'confidential_arr'/);

    const adminRep = { ...rep, user_role: "ADMIN" };
    await sqlReviewerAgent.reviewSql(adminRep, generated(`SELECT c.company_id, c.confidential_arr FROM ${DB}.synthetic_companies AS c LIMIT 5`), null);
    expect(spy.mock.calls[2][1]).toContain("Deterministic access-control check: PASSED");
    // Column sensitivity is visible in the schema registry the reviewer sees.
    expect(spy.mock.calls[2][1]).toContain("sensitivity=restricted");
  });

  it("gives the generator full vocabularies of approved columns and the empty-column list", async () => {
    vi.spyOn(valueDiscoveryService, "getCachedValues").mockReturnValue({
      "synthetic_contacts.seniority_level": { table: "synthetic_contacts", column: "seniority_level", strategy: "categorical_enum", completeness: "complete", values: ["C-Level", "VP", "Director"], exact_count: 3, is_exact: true },
      "synthetic_raw_events.event_type": { table: "synthetic_raw_events", column: "event_type", strategy: "categorical_enum", completeness: "complete", values: ["page_view"], exact_count: 1, is_exact: true },
      "synthetic_companies.technologies": { table: "synthetic_companies", column: "technologies", strategy: "array_enum", completeness: "complete", values: [], exact_count: 0, is_exact: true },
      "synthetic_companies.city": { table: "synthetic_companies", column: "city", strategy: "categorical_enum", completeness: "complete", values: Array.from({ length: 80 }, (_, i) => `City ${i}`), exact_count: 80, is_exact: true },
    });
    const spy = vi.spyOn(llmAdapter, "generateCompletion");
    const rep = searchOrchestrator.buildIntermediateRepresentation(searchRequestSchema.parse({ natural_query: "companies" }), "MEMBER");
    await sqlGeneratorAgent.generateSql(rep, "companies");

    const prompt = spy.mock.calls[0][1];
    const vocabulary = JSON.parse(prompt.split("Verified Distinct Values Sample:\n")[1].split("\n")[0]);
    expect(vocabulary).toEqual({ "synthetic_contacts.seniority_level": ["C-Level", "VP", "Director"] }); // unapproved table and long list left out
    expect(prompt).toContain('Empty Columns (no data, never filter on these):\n["synthetic_companies.technologies"]');
  });

  it("sends the Azure deployment its per-agent reasoning effort", async () => {
    const settings = getSettings();
    Object.assign(settings, {
      LLM_PROVIDER: "azure",
      AZURE_OPENAI_ENDPOINT: "https://example.services.ai.azure.com/openai/v1",
      AZURE_OPENAI_API_KEY: "test-key",
      AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini",
      AZURE_OPENAI_REASONING_EFFORT: "medium",
      AZURE_OPENAI_REVIEWER_REASONING_EFFORT: "low",
      AZURE_OPENAI_TEMPERATURE: null,
    });
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String((init as RequestInit).body)));
      return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 0, model: "gpt-5-mini", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"ok":true}' } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    try {
      expect(await llmAdapter.generateCompletion("sys", "user", undefined, 10, "generator")).toBe('{"ok":true}');
      await llmAdapter.generateCompletion("sys", "user", undefined, 10, "reviewer");
    } finally {
      Object.assign(settings, { LLM_PROVIDER: "mock" });
    }
    expect(bodies[0]).toMatchObject({ model: "gpt-5-mini", reasoning_effort: "medium", max_completion_tokens: 16000, response_format: { type: "json_object" } });
    expect(bodies[0]).not.toHaveProperty("temperature");
    expect(bodies[1]).toMatchObject({ reasoning_effort: "low" });
  });
});
