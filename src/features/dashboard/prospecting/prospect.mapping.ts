import type { Prospect } from "./prospect.types";

/**
 * Turns a search result row into a Prospect. The SQL generator chooses the
 * selected columns, so each attribute is read from the first of several known
 * column names (the growstack warehouse's, then the synthetic dataset's).
 */

type Row = Record<string, unknown>;

function pick(row: Row, lowerIndex: Map<string, string>, names: readonly string[]): unknown {
  for (const name of names) {
    const key = lowerIndex.get(name.toLowerCase());
    if (key !== undefined) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== "") return value;
    }
  }
  return null;
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function textOrNull(value: unknown): string | null {
  const result = text(value);
  return result ? result : null;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const joined = text(value);
  return joined ? joined.split(/\s*[,;]\s*/).filter(Boolean) : [];
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toUpperCase() === "VALID";
}

const MS_PER_DAY = 86_400_000;

/** Days between a YYYY-MM-DD start date and `now`; null for missing or future dates. */
export function daysSince(value: unknown, now = new Date()): number | null {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const started = Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(started)) return null;
  const days = Math.floor((now.getTime() - started) / MS_PER_DAY);
  return days >= 0 ? days : null;
}

export function recordToProspect(row: Row, index: number, now = new Date()): Prospect {
  const keys = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  const get = (...names: string[]) => pick(row, keys, names);

  const fullName = text(get("FULL_NAME_PER", "full_name", "name"));
  const [fallbackFirst = "", ...fallbackRest] = fullName.split(/\s+/);
  const phone = textOrNull(get("enriched_phone", "CELLPHONE_PER", "DIRECT_PHONE_PER", "direct_phone", "phone"));
  const linkedinUrl = textOrNull(get("LINKEDIN_URL_PER", "linkedin_url"));
  const hiring = get("IS_HIRING", "is_hiring");

  return {
    id: text(get("contact_id", "RBID_PER", "id")) || `row-${index}`,
    firstName: text(get("FIRST_NAME_PER", "first_name")) || fallbackFirst,
    lastName: text(get("LAST_NAME_PER", "last_name")) || fallbackRest.join(" "),
    title: text(get("JOB_TITLE_PER", "job_title", "title")),
    seniority: text(get("JOB_LEVEL_PER", "seniority_level", "seniority")),
    department: text(get("JOB_FUNCTION_PER", "department")),
    jobFunction: text(get("PERSONA_PER", "job_function")),
    city: text(get("CITY_PER", "city")),
    country: text(get("COUNTRY_NAME_PER", "country")),
    email: textOrNull(get("EMAIL_ADDRESS_PER", "enriched_email_per", "enriched_email", "work_email", "email")),
    phone,
    linkedinUrl,
    verifiedEmail: truthy(get("EMAIL_STATUS_PER", "enriched_email_verification_per", "is_verified")),
    directDial: phone !== null,
    jobChangeDays: daysSince(get("JOB_START_DATE", "job_start_date"), now),
    sources: linkedinUrl ? ["LinkedIn"] : [],
    company: {
      id: textOrNull(get("RBID_ORG", "company_id")),
      name: text(get("COMPANY_NAME_ORG", "company_name")),
      industry: text(get("INDUSTRY_LINKEDIN_ORG", "company_industry", "industry")),
      employees: text(get("EMPLOYEE_COUNT_RANGE_ORG", "size_range", "employee_count")),
      revenue: text(get("REVENUE_RANGE_ORG", "revenue_range")),
      headquarters: text(get("HEADQUARTERS_COUNTRY_NAME_ORG", "COUNTRY_NAME_ORG", "headquarters")),
      website: textOrNull(get("WEBSITE_ORG", "DOMAIN_ORG", "website", "domain")),
      technologies: list(get("COMBINED_TECH_ARRAY_ORG", "COMBINED_TECH_STRING_ORG", "technologies")),
      hiring: truthy(hiring) ? ["Hiring now"] : [],
      funding: text(get("LAST_FUNDING_TYPE_ORG", "funding_stage")),
      intent: null,
    },
  };
}
