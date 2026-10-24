import { JOB_CHANGE_WINDOWS, type Prospect, type ProspectFilters } from "./prospect.types";

export function fullName(prospect: Prospect): string {
  return `${prospect.firstName} ${prospect.lastName}`;
}

export function initials(prospect: Prospect): string {
  return `${prospect.firstName.charAt(0)}${prospect.lastName.charAt(0)}`.toUpperCase();
}

function haystack(prospect: Prospect): string {
  const { company } = prospect;
  return [
    fullName(prospect),
    prospect.title,
    prospect.seniority,
    prospect.department,
    prospect.jobFunction,
    prospect.city,
    prospect.country,
    company.name,
    company.industry,
    company.headquarters,
    ...company.technologies,
  ]
    .join(" ")
    .toLowerCase();
}

/** Every whitespace-separated term of the query must appear somewhere in the record. */
export function matchesQuery(prospect: Prospect, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = haystack(prospect);
  return terms.every((term) => text.includes(term));
}

function includesAny<T extends string>(selected: readonly string[], value: T): boolean {
  return selected.length === 0 || selected.includes(value);
}

function overlapsAny(selected: readonly string[], values: readonly string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

export function matchesFilters(prospect: Prospect, filters: ProspectFilters): boolean {
  const { company } = prospect;
  const jobChangeWindow = JOB_CHANGE_WINDOWS.find((option) => option.value === filters.jobChange);
  const withinJobChangeWindow =
    !jobChangeWindow || jobChangeWindow.days === null
      ? true
      : prospect.jobChangeDays !== null && prospect.jobChangeDays <= jobChangeWindow.days;

  return (
    matchesQuery(prospect, filters.query) &&
    includesAny(filters.titles, prospect.title) &&
    includesAny(filters.seniorities, prospect.seniority) &&
    includesAny(filters.departments, prospect.department) &&
    includesAny(filters.functions, prospect.jobFunction) &&
    includesAny(filters.countries, prospect.country) &&
    (!filters.verifiedEmail || prospect.verifiedEmail) &&
    (!filters.directDial || prospect.directDial) &&
    withinJobChangeWindow &&
    overlapsAny(filters.sources, prospect.sources) &&
    includesAny(filters.companies, company.name) &&
    includesAny(filters.industries, company.industry) &&
    includesAny(filters.employees, company.employees) &&
    includesAny(filters.revenue, company.revenue) &&
    includesAny(filters.headquarters, company.headquarters) &&
    overlapsAny(filters.technologies, company.technologies) &&
    overlapsAny(filters.hiring, company.hiring) &&
    includesAny(filters.funding, company.funding) &&
    includesAny(filters.intent, company.intent)
  );
}

export function searchProspects(prospects: readonly Prospect[], filters: ProspectFilters): Prospect[] {
  return prospects.filter((prospect) => matchesFilters(prospect, filters));
}

export interface ProspectSummary {
  total: number;
  verifiedEmail: number;
  directDial: number;
  /** Started a new role within the last 90 days. */
  recentJobChanges: number;
  highIntent: number;
}

export function summariseProspects(prospects: readonly Prospect[]): ProspectSummary {
  return prospects.reduce<ProspectSummary>(
    (summary, prospect) => ({
      total: summary.total + 1,
      verifiedEmail: summary.verifiedEmail + (prospect.verifiedEmail ? 1 : 0),
      directDial: summary.directDial + (prospect.directDial ? 1 : 0),
      recentJobChanges: summary.recentJobChanges + (prospect.jobChangeDays !== null && prospect.jobChangeDays <= 90 ? 1 : 0),
      highIntent: summary.highIntent + (prospect.company.intent === "High" ? 1 : 0),
    }),
    { total: 0, verifiedEmail: 0, directDial: 0, recentJobChanges: 0, highIntent: 0 },
  );
}

export function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
