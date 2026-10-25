import type { ColumnValues } from "../api/dashboard.api";
import {
  DIRECT_DIAL_FILTER,
  FILTER_COLUMNS,
  VERIFIED_EMAIL_FILTER,
  type CountryNames,
  type FilterColumn,
} from "./prospect.query";
import {
  EMPTY_FILTERS,
  JOB_CHANGE_WINDOWS,
  type EnrichmentOptions,
  type JobChangeWindow,
  type MultiFilterKey,
  type ProspectFilters,
  type ToggleFilterKey,
} from "./prospect.types";

export type FilterTab = "people" | "company" | "enrich";

interface FieldBase {
  label: string;
  tab: Exclude<FilterTab, "enrich">;
}

export type FilterField =
  | (FieldBase & { kind: "multi"; key: MultiFilterKey; options: readonly string[]; allowCustom: boolean })
  | (FieldBase & { kind: "toggle"; key: ToggleFilterKey; description: string })
  | (FieldBase & { kind: "choice"; key: "jobChange"; options: readonly { value: JobChangeWindow; label: string }[] });

/** Discovered values for the warehouse columns behind the filters (`/api/search/metadata/values`). */
export type Facets = Readonly<Record<string, ColumnValues>>;

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

const MULTI_FIELDS: readonly { key: MultiFilterKey; tab: FieldBase["tab"]; label: string }[] = [
  { key: "titles", tab: "people", label: "Job title" },
  { key: "seniorities", tab: "people", label: "Seniority" },
  { key: "departments", tab: "people", label: "Department" },
  { key: "functions", tab: "people", label: "Persona" },
  { key: "countries", tab: "people", label: "Location" },
  { key: "sources", tab: "people", label: "Data source" },
  { key: "companies", tab: "company", label: "Company" },
  { key: "industries", tab: "company", label: "Industry" },
  { key: "employees", tab: "company", label: "Employees" },
  { key: "revenue", tab: "company", label: "Revenue" },
  { key: "headquarters", tab: "company", label: "Headquarters" },
  { key: "technologies", tab: "company", label: "Technologies used" },
  { key: "hiring", tab: "company", label: "Hiring activity" },
  { key: "funding", tab: "company", label: "Funding" },
];

/** A column the caller may query and that holds data. */
function usable(facets: Facets, column: string): boolean {
  const facet = facets[column];
  return facet !== undefined && !facet.empty;
}

function optionsFor(definition: FilterColumn, facets: Facets, countries: CountryNames): string[] {
  if (definition.fixedOptions) return Object.keys(definition.fixedOptions);
  const values = definition.optionsFrom ? (facets[definition.optionsFrom]?.values ?? []) : [];
  return uniqueSorted(definition.countryCodes ? values.map((code) => countries.name(code)) : values);
}

/**
 * The filter registry. Every filter maps to a warehouse column (see
 * `prospect.query.ts`); options are the values discovered in that column, and
 * filters whose column is unavailable to this user or holds no data are left out.
 */
export function buildFilterFields(facets: Facets, countries: CountryNames): FilterField[] {
  const fields: FilterField[] = [];
  for (const { key, tab, label } of MULTI_FIELDS) {
    const definition = FILTER_COLUMNS[key];
    if (!definition || !usable(facets, definition.column)) continue;
    const options = optionsFor(definition, facets, countries);
    const allowCustom = definition.custom === true;
    if (options.length === 0 && !allowCustom) continue;
    fields.push({ kind: "multi", tab, key, label, options, allowCustom });
  }

  const peopleToggles: FilterField[] = [];
  if (usable(facets, "new_combined_data.JOB_START_DATE")) {
    peopleToggles.push({ kind: "choice", tab: "people", key: "jobChange", label: "Changed jobs", options: JOB_CHANGE_WINDOWS });
  }
  if (usable(facets, VERIFIED_EMAIL_FILTER.field)) {
    peopleToggles.push({ kind: "toggle", tab: "people", key: "verifiedEmail", label: "Verified email only", description: "Email checked before delivery" });
  }
  if (usable(facets, DIRECT_DIAL_FILTER.field)) {
    peopleToggles.push({ kind: "toggle", tab: "people", key: "directDial", label: "Phone number only", description: "A phone number on record" });
  }
  // Keep the toggles after the people list filters and before the company tab.
  const firstCompany = fields.findIndex((field) => field.tab === "company");
  fields.splice(firstCompany === -1 ? fields.length : firstCompany, 0, ...peopleToggles);
  return fields;
}

export const ENRICHMENT_FIELDS: readonly { key: keyof EnrichmentOptions; label: string; description: string }[] = [
  { key: "verifiedEmail", label: "Verified work email", description: "Deliverability-checked address for every contact." },
  { key: "directDial", label: "Direct dial", description: "A validated direct or mobile number where one exists." },
  { key: "missingContactDetails", label: "Fill missing contact details", description: "Title, seniority and location gaps completed." },
  { key: "companyFirmographics", label: "Company firmographics", description: "Industry, headcount, revenue band and headquarters." },
  { key: "technologies", label: "Technologies used", description: "The tools detected on the company's web presence." },
  { key: "signals", label: "Hiring, funding and intent signals", description: "Open roles, latest round and buying-intent level." },
];

const FILTER_LABELS: Record<Exclude<keyof ProspectFilters, "query">, string> = {
  titles: "Title",
  seniorities: "Seniority",
  departments: "Department",
  functions: "Persona",
  countries: "Location",
  verifiedEmail: "Verified email",
  directDial: "Phone",
  jobChange: "Changed jobs",
  sources: "Source",
  companies: "Company",
  industries: "Industry",
  employees: "Employees",
  revenue: "Revenue",
  headquarters: "HQ",
  technologies: "Tech",
  hiring: "Hiring",
  funding: "Funding",
  intent: "Intent",
};

export interface ActiveFilterChip {
  key: keyof ProspectFilters;
  /** Present for list-valued filters: the single option this chip removes. */
  value?: string;
  label: string;
}

/** One removable chip per active filter value, in registry order. */
export function activeFilterChips(filters: ProspectFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.query.trim()) chips.push({ key: "query", label: `“${filters.query.trim()}”` });

  for (const key of Object.keys(FILTER_LABELS) as (keyof typeof FILTER_LABELS)[]) {
    const value = filters[key];
    if (Array.isArray(value)) {
      value.forEach((option) => chips.push({ key, value: option, label: `${FILTER_LABELS[key]}: ${option}` }));
    } else if (typeof value === "boolean") {
      if (value) chips.push({ key, label: FILTER_LABELS[key] });
    } else if (value !== "any") {
      const window = JOB_CHANGE_WINDOWS.find((option) => option.value === value);
      chips.push({ key, label: `${FILTER_LABELS[key]}: ${window?.label.toLowerCase() ?? value}` });
    }
  }
  return chips;
}

/** Number of active filter values, excluding the free-text query. */
export function countActiveFilters(filters: ProspectFilters): number {
  return activeFilterChips(filters).filter((chip) => chip.key !== "query").length;
}

export function hasActiveFilters(filters: ProspectFilters): boolean {
  return activeFilterChips(filters).length > 0;
}

export function isProspectFilters(value: unknown): value is ProspectFilters {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (Object.keys(EMPTY_FILTERS) as (keyof ProspectFilters)[]).every((key) => {
    const expected = EMPTY_FILTERS[key];
    const actual = candidate[key];
    if (Array.isArray(expected)) return Array.isArray(actual) && actual.every((item) => typeof item === "string");
    return typeof actual === typeof expected;
  });
}
