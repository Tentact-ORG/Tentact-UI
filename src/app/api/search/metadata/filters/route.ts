import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import type { DiscoveredFilterOptions } from "@/server/schemas/search";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Discovered distinct values and ranges used to populate the ICP filter controls. */
export const GET = route(async (request) => {
  await getCurrentUser(request);
  const cached = valueDiscoveryService.getCachedValues();
  const list = (key: string): unknown[] => {
    const values = cached[key]?.values;
    return Array.isArray(values) ? values : [];
  };
  const range = (key: string, fallback: Record<string, number>): Record<string, unknown> => {
    const values = cached[key]?.values ?? fallback;
    return isRecord(values) ? values : fallback;
  };

  const options: DiscoveredFilterOptions = {
    industries: list("synthetic_companies.industry"),
    countries: list("synthetic_companies.country"),
    technologies: list("synthetic_companies.technologies"),
    job_titles: list("synthetic_contacts.job_title").slice(0, 50),
    funding_stages: list("synthetic_companies.funding_stage"),
    employee_range: range("synthetic_companies.employee_count", { min: 1, max: 10000 }),
    revenue_range: range("synthetic_companies.annual_revenue_usd", { min: 100000, max: 500000000 }),
  };
  return json(options);
});
