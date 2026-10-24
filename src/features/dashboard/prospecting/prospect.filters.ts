import {
  DEPARTMENTS,
  EMPLOYEE_BANDS,
  EMPTY_FILTERS,
  FUNDING_STAGES,
  HIRING_SIGNALS,
  INTENT_LEVELS,
  JOB_CHANGE_WINDOWS,
  PROSPECT_SOURCES,
  REVENUE_BANDS,
  SENIORITIES,
  type EnrichmentOptions,
  type JobChangeWindow,
  type MultiFilterKey,
  type Prospect,
  type ProspectFilters,
  type ToggleFilterKey,
} from "./prospect.types";

export type FilterTab = "people" | "company" | "enrich";

interface FieldBase {
  label: string;
  tab: Exclude<FilterTab, "enrich">;
}

export type FilterField =
  | (FieldBase & { kind: "multi"; key: MultiFilterKey; options: readonly string[] })
  | (FieldBase & { kind: "toggle"; key: ToggleFilterKey; description: string })
  | (FieldBase & { kind: "choice"; key: "jobChange"; options: readonly { value: JobChangeWindow; label: string }[] });

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * The filter registry. Enumerated attributes have fixed options; free-text
 * attributes (titles, companies, locations, technologies…) offer the values
 * present in the workspace's data.
 */
export function buildFilterFields(prospects: readonly Prospect[]): FilterField[] {
  return [
    { kind: "multi", tab: "people", key: "titles", label: "Job title", options: uniqueSorted(prospects.map((p) => p.title)) },
    { kind: "multi", tab: "people", key: "seniorities", label: "Seniority", options: SENIORITIES },
    { kind: "multi", tab: "people", key: "departments", label: "Department", options: DEPARTMENTS },
    { kind: "multi", tab: "people", key: "functions", label: "Job function", options: uniqueSorted(prospects.map((p) => p.jobFunction)) },
    { kind: "multi", tab: "people", key: "countries", label: "Location", options: uniqueSorted(prospects.map((p) => p.country)) },
    { kind: "choice", tab: "people", key: "jobChange", label: "Changed jobs", options: JOB_CHANGE_WINDOWS },
    { kind: "toggle", tab: "people", key: "verifiedEmail", label: "Verified email only", description: "Email checked before delivery" },
    { kind: "toggle", tab: "people", key: "directDial", label: "Direct dial only", description: "A validated phone number on record" },
    { kind: "multi", tab: "people", key: "sources", label: "Data source", options: PROSPECT_SOURCES },

    { kind: "multi", tab: "company", key: "companies", label: "Company", options: uniqueSorted(prospects.map((p) => p.company.name)) },
    { kind: "multi", tab: "company", key: "industries", label: "Industry", options: uniqueSorted(prospects.map((p) => p.company.industry)) },
    { kind: "multi", tab: "company", key: "employees", label: "Employees", options: EMPLOYEE_BANDS },
    { kind: "multi", tab: "company", key: "revenue", label: "Revenue", options: REVENUE_BANDS },
    { kind: "multi", tab: "company", key: "headquarters", label: "Headquarters", options: uniqueSorted(prospects.map((p) => p.company.headquarters)) },
    { kind: "multi", tab: "company", key: "technologies", label: "Technologies used", options: uniqueSorted(prospects.flatMap((p) => p.company.technologies)) },
    { kind: "multi", tab: "company", key: "hiring", label: "Hiring activity", options: HIRING_SIGNALS },
    { kind: "multi", tab: "company", key: "funding", label: "Funding", options: FUNDING_STAGES },
    { kind: "multi", tab: "company", key: "intent", label: "Buying intent", options: INTENT_LEVELS },
  ];
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
  functions: "Function",
  countries: "Location",
  verifiedEmail: "Verified email",
  directDial: "Direct dial",
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
