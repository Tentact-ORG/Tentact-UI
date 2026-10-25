import { beforeEach, describe, expect, it } from "vitest";
import { POST as interpret } from "@/app/api/search/interpret/route";
import { applyInterpretation } from "@/features/dashboard/prospecting/prospect.filters";
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
      },
      FIELDS,
    );
    expect(result).toEqual({
      filters: { seniorities: ["VP", "Director"], countries: ["United States"], titles: ["Head of Growth"], verifiedEmail: ["true"], jobChange: ["Last 90 days"] },
      remaining_query: "recently raised a Series B",
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
    const next = applyInterpretation(base, { filters: { seniorities: ["VP"], countries: ["India"], verifiedEmail: ["true"], jobChange: ["Last 90 days"] }, remaining_query: "" }, fields);
    expect(next).toMatchObject({ query: "", seniorities: ["VP"], countries: ["India"], employees: ["51 to 200"], verifiedEmail: true, jobChange: "90" });
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
