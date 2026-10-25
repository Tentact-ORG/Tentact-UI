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
  /** Set when contact details are masked: reveal them through `reveal`. */
  result_id: string | null;
  /** Contacts the workspace already paid for (shown unmasked). */
  revealed_ids: string[];
  /** Contacts whose details are masked in this page: the ids `reveal` accepts. */
  masked_ids: string[];
  contact_details_masked: boolean;
}

export interface InterpretField {
  key: string;
  label: string;
  kind: "multi" | "toggle" | "choice";
  options: readonly string[];
  allow_custom: boolean;
}

export interface InterpretResponse {
  /** Field key → values: options of multi fields, ["true"] for toggles, one option value for choices. */
  filters: Record<string, string[]>;
  /** Criteria no filter expresses; kept as the search text. */
  remaining_query: string;
}

export interface RevealResponse {
  /** Contact id → unmasked contact-detail columns. */
  contacts: Record<string, Record<string, unknown>>;
  charged: number;
  newly_revealed: number;
  balance: number;
}

export interface CreditEntryRecord {
  id: number;
  delta: number;
  balance_after: number;
  reason: string;
  reference: string | null;
  created_at: string;
}

export interface CreditRequestRecord {
  id: number;
  credits: number;
  pack: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED";
  note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface CreditSummary {
  enabled: boolean;
  cost_per_contact: number;
  balance: number;
  history: CreditEntryRecord[];
  requests: CreditRequestRecord[];
  is_operator: boolean;
}

export interface PendingCreditRequest {
  id: number;
  org_id: number;
  workspace: string;
  requested_by: string;
  credits: number;
  pack: string | null;
  note: string | null;
  created_at: string;
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

  interpret: (query: string, fields: readonly InterpretField[]) =>
    apiRequest<InterpretResponse>("/api/search/interpret", { method: "POST", body: jsonBody({ query, fields }) }),

  reveal: (resultId: string, contactIds: readonly string[]) =>
    apiRequest<RevealResponse>("/api/contacts/reveal", { method: "POST", body: jsonBody({ result_id: resultId, contact_ids: contactIds }) }),

  credits: () => apiRequest<CreditSummary>("/api/credits"),
  requestCredits: (credits: number, pack: string | null) =>
    apiRequest<CreditRequestRecord>("/api/credits/requests", { method: "POST", body: jsonBody({ credits, pack }) }),
  pendingCreditRequests: () => apiRequest<PendingCreditRequest[]>("/api/credits/requests"),
  decideCreditRequest: (id: number, status: "APPROVED" | "DECLINED") =>
    apiRequest<{ id: number; status: string; balance: number | null }>(`/api/credits/requests/${id}`, { method: "PATCH", body: jsonBody({ status }) }),
};

export function errorText(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
