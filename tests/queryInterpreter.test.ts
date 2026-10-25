import { beforeEach, describe, expect, it } from "vitest";
import { POST as interpret } from "@/app/api/search/interpret/route";
import { applyInterpretation, explainInterpretation } from "@/features/dashboard/prospecting/prospect.filters";
import { EMPTY_FILTERS } from "@/features/dashboard/prospecting/prospect.types";
import type { FilterField } from "@/features/dashboard/prospecting/prospect.filters";
import { sanitizeInterpretation, type InterpretRequest } from "@/server/services/queryInterpreter";
import { authHeaders, callRoute, seedTestData, type SeedData } from "./helpers";

const FIELDS: InterpretRequest["fields"] = [
  { key: "seniorities", label: "Seniority", kind: "multi", options: ["C-Team", "VP", "Director", "Manager"], allow_custom: false },
  { key: "countries", label: "Location", kind: "multi", options: ["United States", "India"], allow_custom: false },
  { key: "employees", label: "Employees", kind: "multi", options: ["11 to 50", "51 to 200"], allow_custom: false },
  { key: "titles", label: "Job title", kind: "multi", options: [], allow_custom: true },
  { key: "verifiedEmail", label: "Verified email only", kind: "toggle", options: [], allow_custom: false },
  { key: "jobChange", label: "Changed jobs", kind: "choice", options: ["Any time", "Last 90 days"], allow_custom: false },
];

describe("query interpretation", () => {
  it("keeps only values the fields accept", () => {
    const result = sanitizeInterpretation(
      {
        filters: {
          seniorities: ["vp", "Director", "Overlord"],
          countries: "united states",
          employees: ["51-200"],
          titles: ["Head of Growth"],
          verifiedEmail: true,
          jobChange: ["Last 90 days"],
          unknownField: ["x"],
        },
        remaining_query: " recently raised a Series B ",
        suggestions: [
          { key: "seniorities", value: "c-team" },
          { key: "seniorities", value: "VP" },
          { key: "employees", value: "1000+" },
          { key: "verifiedEmail", value: "true" },
        ],
        evidence: { seniorities: "VP or Director", countries: "in the US", titles: "Head of Growth", employees: "51-200", verifiedEmail: "made up words" },
      },
      FIELDS,
      "Head of Growth, VP or Director in the US who raised a Series B, with verified emails",
    );
    expect(result).toEqual({
      filters: { seniorities: ["VP", "Director"], countries: ["United States"], titles: ["Head of Growth"], verifiedEmail: ["true"], jobChange: ["Last 90 days"] },
      remaining_query: "recently raised a Series B",
      // Already-selected, unknown and non-multi suggestions are dropped.
      suggestions: [{ key: "seniorities", value: "C-Team" }],
      // Evidence stays only for fields that were set and words that occur in the query.
      evidence: { seniorities: "VP or Director", countries: "in the US", titles: "Head of Growth" },
    });
  });

  it("applies an interpretation onto the dashboard filters", () => {
    const fields = [
      { kind: "multi", tab: "people", key: "seniorities", label: "Seniority", options: ["VP"], allowCustom: false },
      { kind: "multi", tab: "people", key: "countries", label: "Location", options: ["India"], allowCustom: false },
      { kind: "toggle", tab: "people", key: "verifiedEmail", label: "Verified email only", description: "" },
      { kind: "choice", tab: "people", key: "jobChange", label: "Changed jobs", options: [{ value: "90", label: "Last 90 days" }] },
    ] as FilterField[];
    const base = { ...EMPTY_FILTERS, query: "VP in India", countries: ["United States"], employees: ["51 to 200"] };
    const next = applyInterpretation(base, { filters: { seniorities: ["VP"], countries: ["India"], verifiedEmail: ["true"], jobChange: ["Last 90 days"] }, remaining_query: "", suggestions: [], evidence: {} }, fields);
    expect(next).toMatchObject({ query: "", seniorities: ["VP"], countries: ["India"], employees: ["51 to 200"], verifiedEmail: true, jobChange: "90" });
  });
});

describe("what we understood", () => {
  it("doesn't also search as text the words it turned into a filter", () => {
    const result = sanitizeInterpretation(
      { filters: { titles: ["Founder"] }, remaining_query: "founders", suggestions: [], evidence: { titles: "founders" } },
      FIELDS,
      "founders",
    );
    expect(result.remaining_query).toBe("");
  });

  it("groups filters by the words they came from, in query order", () => {
    const fields = [
      { kind: "multi", tab: "people", key: "titles", label: "Job title", options: [], allowCustom: true },
      { kind: "multi", tab: "people", key: "seniorities", label: "Seniority", options: ["Director"], allowCustom: false },
      { kind: "multi", tab: "people", key: "countries", label: "Location", options: ["United States"], allowCustom: false },
      { kind: "toggle", tab: "people", key: "verifiedEmail", label: "Verified email only", description: "" },
    ] as FilterField[];
    const query = "Verified Marketing Directors in the United States";
    const rows = explainInterpretation(
      query,
      {
        filters: { titles: ["Marketing Director"], seniorities: ["Director"], countries: ["United States"], verifiedEmail: ["true"] },
        remaining_query: "",
        suggestions: [],
        evidence: { titles: "Marketing Directors", seniorities: "Marketing Directors", countries: "in the United States", verifiedEmail: "Verified" },
      },
      fields,
    );
    expect(rows).toEqual([
      { phrase: "Verified", items: [{ label: "Verified email only", values: ["Yes"] }] },
      { phrase: "Marketing Directors", items: [{ label: "Job title", values: ["Marketing Director"] }, { label: "Seniority", values: ["Director"] }] },
      { phrase: "in the United States", items: [{ label: "Location", values: ["United States"] }] },
    ]);
  });
});

describe("POST /api/search/interpret", () => {
  let seed: SeedData;
  beforeEach(async () => {
    seed = await seedTestData();
  });

  it("returns filters for signed-in users (offline mock provider)", async () => {
    const res = await callRoute(interpret, { method: "POST", body: { query: "Director people in India", fields: FIELDS }, headers: await authHeaders(seed.member) });
    expect(res.status).toBe(200);
    expect(res.body.filters).toMatchObject({ seniorities: ["Director"], countries: ["India"] });
    expect((await callRoute(interpret, { method: "POST", body: { query: "x", fields: FIELDS } })).status).toBe(401);
    expect((await callRoute(interpret, { method: "POST", body: { query: "", fields: FIELDS }, headers: await authHeaders(seed.member) })).status).toBe(422);
  });
});
