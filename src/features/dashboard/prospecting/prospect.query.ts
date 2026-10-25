import type { SearchRequestBody, StructuredFilter } from "../api/dashboard.api";
import { JOB_CHANGE_WINDOWS, type MultiFilterKey, type ProspectFilters } from "./prospect.types";

/** Prospects requested from the server per page (the API maximum). */
export const SEARCH_PAGE_SIZE = 100;

const PEOPLE = "new_combined_data";
const COMPANY_ENRICHMENT = "company_data";

/**
 * Where each list-valued filter lives in the lead warehouse. `optionsFrom` is the
 * column whose discovered values become the filter's options; `custom` filters
 * also accept typed values (free-text attributes with too many values to list).
 */
export interface FilterColumn {
  column: string;
  operator: StructuredFilter["operator"];
  optionsFrom?: string;
  custom?: boolean;
  /** Fixed options for derived filters (e.g. "Hiring now" → IS_HIRING = 1). */
  fixedOptions?: Record<string, { operator: StructuredFilter["operator"]; value: unknown }>;
  /** Options are ISO country codes, displayed as country names. */
  countryCodes?: boolean;
}

export const FILTER_COLUMNS: Partial<Record<MultiFilterKey, FilterColumn>> = {
  titles: { column: `${PEOPLE}.JOB_TITLE_PER`, operator: "contains", custom: true },
  seniorities: { column: `${PEOPLE}.JOB_LEVEL_PER`, operator: "in", optionsFrom: `${PEOPLE}.JOB_LEVEL_PER` },
  departments: { column: `${PEOPLE}.JOB_FUNCTION_PER`, operator: "in", optionsFrom: `${PEOPLE}.JOB_FUNCTION_PER` },
  functions: { column: `${PEOPLE}.PERSONA_PER`, operator: "in", optionsFrom: `${PEOPLE}.PERSONA_PER` },
  countries: { column: `${PEOPLE}.COUNTRY_CODE_PER`, operator: "in", optionsFrom: `${PEOPLE}.COUNTRY_CODE_PER`, countryCodes: true },
  // No "data source" filter: every contact has a LinkedIn URL, so it would filter nothing.
  companies: { column: `${PEOPLE}.COMPANY_NAME_ORG`, operator: "contains", custom: true },
  industries: { column: `${COMPANY_ENRICHMENT}.industry`, operator: "has", optionsFrom: `${COMPANY_ENRICHMENT}.industry`, custom: true },
  employees: { column: `${PEOPLE}.EMPLOYEE_COUNT_RANGE_ORG`, operator: "in", optionsFrom: `${PEOPLE}.EMPLOYEE_COUNT_RANGE_ORG` },
  revenue: { column: `${PEOPLE}.REVENUE_RANGE_ORG`, operator: "in", optionsFrom: `${PEOPLE}.REVENUE_RANGE_ORG` },
  headquarters: { column: `${PEOPLE}.HEADQUARTERS_COUNTRY_NAME_ORG`, operator: "in", optionsFrom: `${PEOPLE}.COUNTRY_CODE_PER`, countryCodes: true, custom: true },
  technologies: { column: `${PEOPLE}.COMBINED_TECH_ARRAY_ORG`, operator: "has", optionsFrom: `${PEOPLE}.COMBINED_TECH_ARRAY_ORG`, custom: true },
  hiring: { column: `${PEOPLE}.IS_HIRING`, operator: "eq", fixedOptions: { "Hiring now": { operator: "eq", value: 1 } } },
  funding: { column: `${PEOPLE}.LAST_FUNDING_TYPE_ORG`, operator: "in", optionsFrom: `${PEOPLE}.LAST_FUNDING_TYPE_ORG` },
};

export const VERIFIED_EMAIL_FILTER: StructuredFilter = { field: `${PEOPLE}.EMAIL_STATUS_PER`, operator: "eq", value: "VALID" };
export const DIRECT_DIAL_FILTER: StructuredFilter = { field: `${PEOPLE}.enriched_phone`, operator: "not_empty", value: true };
const JOB_START_COLUMN = `${PEOPLE}.JOB_START_DATE`;

/** Columns whose discovered values the filter panel needs. */
export function facetKeys(): string[] {
  const keys = new Set<string>();
  for (const definition of Object.values(FILTER_COLUMNS)) {
    if (definition?.optionsFrom) keys.add(definition.optionsFrom);
    if (definition) keys.add(definition.column);
  }
  keys.add(VERIFIED_EMAIL_FILTER.field);
  keys.add(DIRECT_DIAL_FILTER.field);
  keys.add(JOB_START_COLUMN);
  return [...keys];
}

/** Display names for ISO country codes ("US" → "United States"), with reverse lookup. */
export interface CountryNames {
  name(code: string): string;
  code(name: string): string | null;
}

export function createCountryNames(codes: readonly string[]): CountryNames {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    display = null;
  }
  const nameOf = (code: string) => {
    try {
      return display?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const byName = new Map(codes.map((code) => [nameOf(code).toLowerCase(), code]));
  return {
    name: nameOf,
    code: (name) => byName.get(name.toLowerCase()) ?? (/^[A-Z]{2}$/.test(name) ? name : null),
  };
}

function isoDateDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** True when the filters say something about who to find. */
export function hasSearchCriteria(filters: ProspectFilters): boolean {
  if (filters.query.trim()) return true;
  if (filters.verifiedEmail || filters.directDial || filters.jobChange !== "any") return true;
  return (Object.keys(FILTER_COLUMNS) as MultiFilterKey[]).some((key) => filters[key].length > 0);
}

/**
 * Translates the dashboard's filters into a contact search: the free-text query
 * becomes the natural-language request and every filter an explicit structured
 * filter on its warehouse column, which the SQL generator must honour.
 */
export function toSearchRequest(filters: ProspectFilters, page: number, countries: CountryNames, now = new Date()): SearchRequestBody {
  const additional: StructuredFilter[] = [];

  for (const key of Object.keys(FILTER_COLUMNS) as MultiFilterKey[]) {
    const definition = FILTER_COLUMNS[key];
    const selected = filters[key];
    if (!definition || selected.length === 0) continue;

    if (definition.fixedOptions) {
      for (const option of selected) {
        const fixed = definition.fixedOptions[option];
        if (fixed) additional.push({ field: definition.column, operator: fixed.operator, value: fixed.value });
      }
      continue;
    }

    let values: string[] = selected;
    if (definition.countryCodes && definition.column.endsWith("_CODE_PER")) {
      values = selected.map((name) => countries.code(name) ?? name);
    }
    additional.push({
      field: definition.column,
      operator: definition.operator,
      // "contains" filters match any of the typed values.
      value: values.length === 1 && definition.operator === "contains" ? values[0] : values,
    });
  }

  if (filters.verifiedEmail) additional.push(VERIFIED_EMAIL_FILTER);
  if (filters.directDial) additional.push(DIRECT_DIAL_FILTER);
  const window = JOB_CHANGE_WINDOWS.find((option) => option.value === filters.jobChange);
  if (window?.days) additional.push({ field: JOB_START_COLUMN, operator: "gte", value: isoDateDaysAgo(window.days, now) });

  const query = filters.query.trim();
  return {
    natural_query: query || "Find contacts matching the structured filters",
    structured_icp: additional.length > 0 ? { additional_filters: additional } : null,
    search_target: "contact",
    page,
    page_size: SEARCH_PAGE_SIZE,
  };
}
