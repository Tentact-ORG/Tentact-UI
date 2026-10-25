import { describe, expect, expectTypeOf, it } from "vitest";
import { buildCsv } from "@/features/dashboard/prospecting/prospect.export";
import { buildFilterFields, type Facets } from "@/features/dashboard/prospecting/prospect.filters";
import { daysSince, recordToProspect } from "@/features/dashboard/prospecting/prospect.mapping";
import { createCountryNames, facetKeys, hasSearchCriteria, toSearchRequest } from "@/features/dashboard/prospecting/prospect.query";
import { DEFAULT_ENRICHMENT, EMPTY_FILTERS, type Prospect } from "@/features/dashboard/prospecting/prospect.types";
import { prospectSnapshotSchema, type ProspectSnapshot } from "@/server/schemas/lists";
import { searchRequestSchema } from "@/server/schemas/search";

const NOW = new Date("2026-10-25T12:00:00Z");
const countries = createCountryNames(["US", "GB", "IN"]);

describe("dashboard filters → search request", () => {
  it("maps every filter onto its warehouse column", () => {
    const request = toSearchRequest(
      {
        ...EMPTY_FILTERS,
        query: "  VP marketing  ",
        seniorities: ["VP", "Director"],
        countries: ["United States", "India"],
        headquarters: ["United Kingdom"],
        industries: ["Software Development"],
        titles: ["Head of Growth"],
        hiring: ["Hiring now"],
        sources: ["LinkedIn"],
        verifiedEmail: true,
        directDial: true,
        jobChange: "90",
      },
      2,
      countries,
      NOW,
    );
    expect(request).toMatchObject({ natural_query: "VP marketing", search_target: "contact", page: 2, page_size: 100 });
    expect(request.structured_icp?.additional_filters).toEqual([
      { field: "new_combined_data.JOB_TITLE_PER", operator: "contains", value: "Head of Growth" },
      { field: "new_combined_data.JOB_LEVEL_PER", operator: "in", value: ["VP", "Director"] },
      { field: "new_combined_data.COUNTRY_CODE_PER", operator: "in", value: ["US", "IN"] },
      { field: "new_combined_data.LINKEDIN_URL_PER", operator: "not_empty", value: true },
      { field: "company_data.industry", operator: "has", value: ["Software Development"] },
      { field: "new_combined_data.HEADQUARTERS_COUNTRY_NAME_ORG", operator: "in", value: ["United Kingdom"] },
      { field: "new_combined_data.IS_HIRING", operator: "eq", value: 1 },
      { field: "new_combined_data.EMAIL_STATUS_PER", operator: "eq", value: "VALID" },
      { field: "new_combined_data.enriched_phone", operator: "not_empty", value: true },
      { field: "new_combined_data.JOB_START_DATE", operator: "gte", value: "2026-07-27" },
    ]);
    // The backend accepts exactly what the dashboard sends.
    expect(searchRequestSchema.safeParse(request).success).toBe(true);
  });

  it("requires at least one criterion", () => {
    expect(hasSearchCriteria(EMPTY_FILTERS)).toBe(false);
    expect(hasSearchCriteria({ ...EMPTY_FILTERS, query: " " })).toBe(false);
    expect(hasSearchCriteria({ ...EMPTY_FILTERS, query: "cto" })).toBe(true);
    expect(hasSearchCriteria({ ...EMPTY_FILTERS, verifiedEmail: true })).toBe(true);
    expect(toSearchRequest({ ...EMPTY_FILTERS, employees: ["51 to 200"] }, 1, countries).natural_query).toMatch(/structured filters/);
  });

  it("names countries and reverses the mapping", () => {
    expect(countries.name("GB")).toBe("United Kingdom");
    expect(countries.code("united kingdom")).toBe("GB");
    expect(countries.code("Atlantis")).toBeNull();
    expect(facetKeys()).toEqual(expect.arrayContaining(["company_data.industry", "new_combined_data.JOB_LEVEL_PER"]));
  });
});

describe("filter availability", () => {
  const facet = (values: string[] | null, empty = false) => ({ values, empty, complete: values !== null });
  it("offers only filters whose columns hold data and are visible to the user", () => {
    const facets: Facets = {
      "new_combined_data.JOB_LEVEL_PER": facet(["VP", "Staff"]),
      "new_combined_data.COUNTRY_CODE_PER": facet(["US", "GB"]),
      "new_combined_data.JOB_TITLE_PER": facet(null),
      "new_combined_data.COMBINED_TECH_ARRAY_ORG": facet([], true), // measured empty
      "new_combined_data.EMAIL_STATUS_PER": facet(null),
      // IS_HIRING, funding, industry… absent: not approved or not visible
    };
    const fields = buildFilterFields(facets, createCountryNames(["US", "GB"]));
    const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));
    expect(Object.keys(byKey).sort()).toEqual(["countries", "seniorities", "titles", "verifiedEmail"]);
    expect(byKey.countries).toMatchObject({ options: ["United Kingdom", "United States"] });
    expect(byKey.titles).toMatchObject({ options: [], allowCustom: true });
  });
});

describe("warehouse rows → prospects", () => {
  it("maps growstack contact rows", () => {
    const prospect = recordToProspect(
      {
        contact_id: "rb-p1",
        RBID_ORG: "rb-o1",
        FIRST_NAME_PER: "Maya",
        LAST_NAME_PER: "Rao",
        JOB_TITLE_PER: "VP Marketing",
        JOB_LEVEL_PER: "VP",
        JOB_FUNCTION_PER: "Advertising & Marketing",
        JOB_START_DATE: "2026-09-25",
        EMAIL_ADDRESS_PER: "maya@northwind.example",
        EMAIL_STATUS_PER: "VALID",
        CELLPHONE_PER: "",
        enriched_phone: "+1 555 0100",
        LINKEDIN_URL_PER: "https://linkedin.com/in/maya",
        COUNTRY_NAME_PER: "United States",
        COMPANY_NAME_ORG: "Northwind",
        EMPLOYEE_COUNT_RANGE_ORG: "201 to 500",
        IS_HIRING: 1,
        COMBINED_TECH_ARRAY_ORG: ["HubSpot", "Snowflake"],
      },
      0,
      NOW,
    );
    expect(prospect).toMatchObject({
      id: "rb-p1",
      firstName: "Maya",
      seniority: "VP",
      verifiedEmail: true,
      directDial: true,
      phone: "+1 555 0100",
      jobChangeDays: 30,
      sources: ["LinkedIn"],
      company: { id: "rb-o1", name: "Northwind", employees: "201 to 500", hiring: ["Hiring now"], technologies: ["HubSpot", "Snowflake"], intent: null },
    });
    // Every mapped prospect is a valid list snapshot.
    expect(prospectSnapshotSchema.safeParse(prospect).success).toBe(true);
  });

  it("maps synthetic (mock mode) rows and tolerates missing fields", () => {
    const prospect = recordToProspect({ contact_id: 10001, full_name: "Sophie Garcia", job_title: "Data Architect", is_verified: 0, work_email: "s@x.io" }, 3, NOW);
    expect(prospect).toMatchObject({ id: "10001", firstName: "Sophie", lastName: "Garcia", verifiedEmail: false, email: "s@x.io", directDial: false, jobChangeDays: null });
    expect(recordToProspect({}, 7, NOW).id).toBe("row-7");
    expect(daysSince("not a date", NOW)).toBeNull();
    expect(daysSince("2030-01-01", NOW)).toBeNull();
  });

  it("keeps the client Prospect type and the server snapshot schema in sync", () => {
    expectTypeOf<Prospect>().toEqualTypeOf<ProspectSnapshot>();
  });
});

describe("client-side CSV export", () => {
  it("neutralises formula injection and includes contact details", () => {
    const prospect = recordToProspect({ contact_id: "p", FIRST_NAME_PER: "=HYPERLINK(\"x\")", LAST_NAME_PER: "Doe", EMAIL_ADDRESS_PER: "a@b.co" }, 0, NOW);
    const csv = buildCsv([prospect], DEFAULT_ENRICHMENT);
    const [header, row] = csv.split("\r\n");
    expect(header.split(",")).toEqual(expect.arrayContaining(["Name", "Email", "Phone"]));
    expect(row.startsWith(`"'=HYPERLINK(""x"") Doe"`)).toBe(true);
    expect(row).toContain("a@b.co");
  });
});
