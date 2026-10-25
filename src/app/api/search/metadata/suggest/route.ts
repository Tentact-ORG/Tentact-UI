import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { HttpError } from "@/server/core/errors";
import { singleton } from "@/server/core/singleton";
import { SensitivityLevel, UserRole } from "@/server/models/entities";
import { chService } from "@/server/services/clickhouseClient";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Free-text columns too large to list in full: values are looked up as the user types. */
const SUGGESTABLE = new Set(["new_combined_data.JOB_TITLE_PER", "new_combined_data.CITY_PER", "new_combined_data.COMPANY_NAME_ORG"]);
const MAX_RESULTS = 12;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_SIZE = 2000;

const cache = singleton("suggestCache", () => new Map<string, { at: number; values: string[] }>());

function canSee(role: string, sensitivity: string): boolean {
  if (sensitivity === SensitivityLevel.RESTRICTED) return role === UserRole.ADMIN;
  if (sensitivity === SensitivityLevel.INTERNAL) return role === UserRole.ADMIN || role === UserRole.AUDITOR;
  return true;
}

/**
 * `?key=table.column&q=text`: values of a large free-text column that contain
 * `q`, most common first (job titles, cities, company names). The scan stops
 * after 20,000 matches, so it answers in about a second even on the full
 * warehouse; values are ranked by how often they occur among those matches.
 */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const params = new URL(request.url).searchParams;
  const key = params.get("key") ?? "";
  const q = (params.get("q") ?? "").trim();
  if (!SUGGESTABLE.has(key)) throw new HttpError(422, "query.key: not a column with suggestions");
  if (q.length < 2 || q.length > 60) throw new HttpError(422, "query.q: type 2 to 60 characters");

  const [table, column] = key.split(".");
  const meta = schemaDiscoveryService.getCachedSchema()[table]?.columns[column];
  if (!meta?.is_approved || !canSee(user.role, meta.sensitivity)) throw new HttpError(403, "This column isn't available to you");

  const cacheKey = `${key}|${q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return json({ values: hit.values });

  const sql = `SELECT v, count() AS n FROM (SELECT ${column} AS v FROM ${table} WHERE positionCaseInsensitive(${column}, {q:String}) > 0 LIMIT 20000) GROUP BY v ORDER BY n DESC, v LIMIT ${MAX_RESULTS}`;
  const { rows } = await chService.executeQuery(sql, { q }, 6);
  const values = rows.map((row) => String(row[0]).trim()).filter(Boolean);

  cache.set(cacheKey, { at: Date.now(), values });
  while (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return json({ values });
});
