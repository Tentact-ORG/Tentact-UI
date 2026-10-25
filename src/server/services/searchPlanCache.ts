import { createHash } from "node:crypto";
import { singleton } from "../core/singleton";
import type { IntermediateSearchRepresentation } from "../schemas/search";

/**
 * Approved search plans: SQL that the generator produced, the reviewer approved
 * and the validator passed, keyed by everything that shaped it. Re-running the
 * same search (another page, a re-applied saved search) reuses the plan instead
 * of asking the LLM again. That keeps result ordering stable between pages and
 * skips two model calls. Callers still validate every SQL text they execute.
 */

const TTL_MS = 30 * 60_000;
const MAX_ENTRIES = 500;

export interface SearchPlan {
  clickhouseSql: string;
  countSql: string | null;
  parameters: Record<string, unknown>;
  assumptions: string[];
  reviewerVerdict: string;
  reviewerReasoning: string;
  /** Total matching entities, filled in after the first execution. */
  total: { count: number; exact: boolean } | null;
  createdAt: number;
}

/** Stable key: role and schema version plus the parts of the request that affect the SQL (not the page). */
export function searchPlanKey(rep: IntermediateSearchRepresentation, naturalQuery: string | null, schemaFingerprint: string | null): string {
  const shape = {
    role: rep.user_role,
    schema: schemaFingerprint,
    target: rep.search_target,
    query: (naturalQuery ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
    filters: rep.filters,
    sort: [rep.sorting_field, rep.sorting_dir],
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}

class SearchPlanCache {
  private readonly entries = new Map<string, SearchPlan>();

  get(key: string): SearchPlan | null {
    const plan = this.entries.get(key);
    if (!plan) return null;
    if (Date.now() - plan.createdAt > TTL_MS) {
      this.entries.delete(key);
      return null;
    }
    // Refresh recency for the LRU order.
    this.entries.delete(key);
    this.entries.set(key, plan);
    return plan;
  }

  set(key: string, plan: SearchPlan): void {
    this.entries.delete(key);
    this.entries.set(key, plan);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

export const searchPlanCache = singleton("searchPlanCache", () => new SearchPlanCache());
