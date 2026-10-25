import { getCurrentUser } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { HttpError } from "@/server/core/errors";
import { SensitivityLevel, UserRole } from "@/server/models/entities";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 50;
const MAX_VALUES = 500;
const KEY_PATTERN = /^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

export interface ColumnValues {
  /** Discovered distinct values; null when the column is not enumerated (free text, PII, not yet discovered). */
  values: string[] | null;
  /** Discovery measured the column as holding no data. */
  empty: boolean;
  /** Every distinct value is listed (false when capped or partial). */
  complete: boolean;
}

function canSee(role: string, sensitivity: string): boolean {
  if (sensitivity === SensitivityLevel.RESTRICTED) return role === UserRole.ADMIN;
  if (sensitivity === SensitivityLevel.INTERNAL) return role === UserRole.ADMIN || role === UserRole.AUDITOR;
  return true;
}

/**
 * Discovered values for `?keys=table.column,...`, used to build filter options.
 * Only approved tables and columns the caller may query are returned; others are omitted.
 */
export const GET = route(async (request) => {
  const user = await getCurrentUser(request);
  const keys = (new URL(request.url).searchParams.get("keys") ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0 || keys.length > MAX_KEYS || !keys.every((key) => KEY_PATTERN.test(key))) {
    throw new HttpError(422, `query.keys: Expected 1-${MAX_KEYS} comma-separated table.column names`);
  }

  const schema = schemaDiscoveryService.getCachedSchema();
  const cached = valueDiscoveryService.getCachedValues();
  const result: Record<string, ColumnValues> = {};
  for (const key of keys) {
    const [table, column] = key.split(".");
    const meta = schema[table]?.columns[column];
    if (!schema[table]?.is_approved || !meta?.is_approved || !canSee(user.role, meta.sensitivity)) continue;

    const entry = cached[key];
    const values = Array.isArray(entry?.values) ? entry.values.filter((v) => v !== null && v !== "").map(String).slice(0, MAX_VALUES) : null;
    result[key] = {
      values: values && values.length > 0 ? values : null,
      empty: entry?.completeness === "complete" && entry.exact_count === 0,
      complete: entry?.completeness === "complete" && Array.isArray(entry.values),
    };
  }
  return json(result);
});
