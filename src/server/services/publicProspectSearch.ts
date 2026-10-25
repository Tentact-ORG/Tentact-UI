import { EXPORT_FIELDS } from "@/lib/exportFields";
import { UserRole } from "../models/entities";
import { contactIdOf } from "./contactMasking";
import { searchOrchestrator } from "./searchOrchestrator";

/**
 * The landing page search: a signed-out visitor's request runs through the
 * same pipeline as the dashboard (model-written SQL, review, validation,
 * read-only execution) for 10 people. Names, job titles and companies are
 * returned; for email, LinkedIn and phone only whether the person has one, so
 * the real values never reach the browser.
 */

export const PUBLIC_RESULT_ROWS = 10;
/** Fetched rows: a few spare, since the warehouse can hold the same person more than once. */
const FETCH_ROWS = 20;

export interface PublicProspect {
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  has_email: boolean;
  has_linkedin: boolean;
  has_phone: boolean;
}

export type PublicSearchOutcome =
  | { kind: "results"; prospects: PublicProspect[]; total: number; exact: boolean }
  | { kind: "clarify"; message: string };

const FIELDS = new Map(EXPORT_FIELDS.map((field) => [field.key, field]));

/** The first non-empty value of an export field's candidate columns, as text. */
function fieldText(record: Record<string, unknown>, key: string): string | null {
  const columns = FIELDS.get(key)?.columns ?? [];
  const byName = new Map(Object.keys(record).map((name) => [name.toLowerCase(), name]));
  for (const column of columns) {
    const name = byName.get(column.toLowerCase());
    const value = name === undefined ? null : record[name];
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

/** A warehouse row as the landing page may show it; null when it has no name to show. */
export function toPublicProspect(record: Record<string, unknown>): PublicProspect | null {
  const fullName =
    fieldText(record, "full_name") ?? ([fieldText(record, "first_name"), fieldText(record, "last_name")].filter(Boolean).join(" ") || null);
  if (!fullName) return null;
  return {
    full_name: fullName,
    job_title: fieldText(record, "job_title"),
    company_name: fieldText(record, "company"),
    has_email: fieldText(record, "email") !== null,
    has_linkedin: fieldText(record, "linkedin_url") !== null,
    has_phone: fieldText(record, "phone") !== null,
  };
}

export async function runPublicProspectSearch(query: string): Promise<PublicSearchOutcome> {
  const result = await searchOrchestrator.executeSearchFlow(
    {
      natural_query: query,
      structured_icp: null,
      search_target: "contact",
      page: 1,
      page_size: FETCH_ROWS,
      sort_by: null,
      sort_dir: "DESC",
    },
    UserRole.MEMBER,
  );
  if (result.clarification_required) {
    return { kind: "clarify", message: result.clarification_message ?? "Please describe the people you're looking for in more detail." };
  }
  const seen = new Set<string>();
  const prospects: PublicProspect[] = [];
  for (const record of result.records as Record<string, unknown>[]) {
    const prospect = toPublicProspect(record);
    if (!prospect) continue;
    // The same person can appear under more than one id, so a repeated name at the same company counts too.
    const keys = [contactIdOf(record), `${prospect.full_name}|${prospect.company_name ?? ""}`.toLowerCase()].filter((key): key is string => key !== null);
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    prospects.push(prospect);
    if (prospects.length === PUBLIC_RESULT_ROWS) break;
  }
  return { kind: "results", prospects, total: result.total_distinct_count, exact: result.exact_count };
}
