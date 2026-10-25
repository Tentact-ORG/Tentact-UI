"use client";

import { ROUTES } from "@/config/site";

/**
 * Typed client for the workspace API (`/api/*`). Requests are same-origin and
 * authenticated by the HttpOnly session cookie, so no token is ever handled in
 * JavaScript. Shapes mirror the route handlers in `src/app/api`.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type FilterOperator = "eq" | "in" | "gte" | "lte" | "between" | "contains" | "has" | "not_empty";

export interface StructuredFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface SearchRequestBody {
  natural_query: string | null;
  structured_icp: { additional_filters: StructuredFilter[] } | null;
  search_target: "company" | "contact";
  page: number;
  page_size: number;
}

export interface SearchDiagnostic {
  generated_sql: string | null;
  reviewer_verdict: string | null;
  reviewer_reasoning: string | null;
  validation_status: string | null;
  repair_attempts: number;
  query_duration_ms: number;
}

export interface SearchResponse {
  total_distinct_count: number;
  exact_count: boolean;
  page: number;
  page_size: number;
  total_pages: number;
  records: Record<string, unknown>[];
  applied_assumptions: string[];
  clarification_required: boolean;
  clarification_message: string | null;
  execution_time_ms: number;
  diagnostic: SearchDiagnostic | null;
}

export interface ColumnValues {
  values: string[] | null;
  empty: boolean;
  complete: boolean;
}

export interface SavedSearchRecord {
  id: number;
  name: string;
  natural_query: string | null;
  ui_state: unknown;
  created_at: string;
}

export interface ProspectListRecord<TProspect> {
  id: number;
  name: string;
  prospect_count: number;
  prospects: TProspect[];
  created_at: string;
}

export type ExportStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED";

export interface ExportJobRecord {
  id: number;
  status: ExportStatus;
  total_rows: number;
  download_token: string | null;
  error_message: string | null;
}

/** Same-origin JSON request to the workspace API; throws ApiError with the server's `detail` message. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  if (response.status === 401 && typeof window !== "undefined") {
    // The session ended (signed out elsewhere, expired or deactivated): back to sign-in.
    window.location.assign(ROUTES.login);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) message = body.detail;
    } catch {
      // keep the generic message
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

const jsonBody = (value: unknown) => JSON.stringify(value);

export const dashboardApi = {
  search: (body: SearchRequestBody) => apiRequest<SearchResponse>("/api/search", { method: "POST", body: jsonBody(body) }),

  columnValues: (keys: readonly string[]) =>
    apiRequest<Record<string, ColumnValues>>(`/api/search/metadata/values?keys=${encodeURIComponent(keys.join(","))}`),

  listSavedSearches: () => apiRequest<SavedSearchRecord[]>("/api/search/saved"),
  saveSearch: (body: { name: string; search_request: SearchRequestBody; ui_state: Record<string, unknown> }) =>
    apiRequest<{ id: number; name: string; created_at: string }>("/api/search/saved", { method: "POST", body: jsonBody(body) }),
  deleteSavedSearch: (id: string) => apiRequest<{ status: string }>(`/api/search/saved/${encodeURIComponent(id)}`, { method: "DELETE" }),

  listLists: <TProspect>() => apiRequest<ProspectListRecord<TProspect>[]>("/api/lists"),
  createList: <TProspect>(name: string, prospects: readonly TProspect[]) =>
    apiRequest<ProspectListRecord<TProspect>>("/api/lists", { method: "POST", body: jsonBody({ name, prospects }) }),
  deleteList: (id: string) => apiRequest<{ status: string }>(`/api/lists/${encodeURIComponent(id)}`, { method: "DELETE" }),

  createExport: (searchRequest: SearchRequestBody, maxRows: number) =>
    apiRequest<ExportJobRecord>("/api/export", { method: "POST", body: jsonBody({ search_request: searchRequest, max_rows: maxRows }) }),
  getExport: (id: number) => apiRequest<ExportJobRecord>(`/api/export/${id}`),
  exportDownloadUrl: (token: string) => `/api/export/download/${encodeURIComponent(token)}`,
};

export function errorText(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
