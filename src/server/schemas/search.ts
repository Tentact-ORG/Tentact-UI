import { z } from "zod";

export const SearchTarget = { COMPANY: "company", CONTACT: "contact" } as const;
export type SearchTarget = (typeof SearchTarget)[keyof typeof SearchTarget];

export const FilterOperator = {
  EQ: "eq",
  IN: "in",
  GTE: "gte",
  LTE: "lte",
  BETWEEN: "between",
  CONTAINS: "contains",
  HAS: "has", // ClickHouse array membership: has(technologies, 'React')
} as const;
export type FilterOperator = (typeof FilterOperator)[keyof typeof FilterOperator];

// Bounds keep request validation and downstream prompts small for untrusted input.
const MAX_LIST_ITEMS = 100;
const shortText = z.string().max(500);
const textList = z.array(shortText).max(MAX_LIST_ITEMS);

export const structuredFilterSchema = z.object({
  field: z.string().max(200),
  operator: z.enum(["eq", "in", "gte", "lte", "between", "contains", "has"]),
  value: z.unknown(),
});
export type StructuredFilter = z.infer<typeof structuredFilterSchema>;

// Every optional field is materialised as `null` so parsed objects match pydantic's model_dump().
export const structuredIcpSchema = z.object({
  industry: textList.nullable().default(null),
  country: textList.nullable().default(null),
  min_employees: z.number().int().nullable().default(null),
  max_employees: z.number().int().nullable().default(null),
  min_revenue: z.number().nullable().default(null),
  max_revenue: z.number().nullable().default(null),
  technologies: textList.nullable().default(null),
  job_title: shortText.nullable().default(null),
  email: shortText.nullable().default(null),
  department: shortText.nullable().default(null),
  seniority_level: shortText.nullable().default(null),
  additional_filters: z.array(structuredFilterSchema).max(50).nullable().default([]),
});
export type StructuredICP = z.infer<typeof structuredIcpSchema>;

export const searchRequestSchema = z.object({
  natural_query: z.string().max(2000).nullable().default(null),
  structured_icp: structuredIcpSchema.nullable().default(null),
  search_target: z.enum(["company", "contact"]).default("company"),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(25),
  sort_by: z.string().max(200).nullable().default(null),
  sort_dir: z.string().max(10).nullable().default("DESC"),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export interface IntermediateSearchRepresentation {
  search_target: SearchTarget;
  filters: StructuredFilter[];
  normalized_values: Record<string, unknown>;
  relevant_columns: string[];
  required_entity_identifiers: string[];
  requested_output_fields: string[];
  sorting_field: string | null;
  sorting_dir: string;
  page: number;
  page_size: number;
  ambiguities: string[];
  clarification_needed: boolean;
  clarification_prompt: string | null;
  assumptions: string[];
  user_role: string;
}

export interface SearchDiagnostic {
  generated_sql: string | null;
  parameters: Record<string, unknown> | null;
  reviewer_verdict: string | null;
  reviewer_reasoning: string | null;
  validation_status: string | null;
  repair_attempts: number;
  query_duration_ms: number;
}

export interface SearchResultResponse {
  search_target: SearchTarget;
  total_distinct_count: number;
  exact_count: boolean;
  page: number;
  page_size: number;
  total_pages: number;
  records: Record<string, unknown>[];
  applied_assumptions: string[];
  applied_filters: StructuredFilter[];
  clarification_required: boolean;
  clarification_message: string | null;
  execution_time_ms: number;
  diagnostic: SearchDiagnostic | null;
}

export const saveSearchRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullable().default(null),
  search_request: searchRequestSchema,
});

export interface DiscoveredFilterOptions {
  industries: unknown[];
  countries: unknown[];
  technologies: unknown[];
  job_titles: unknown[];
  funding_stages: unknown[];
  employee_range: Record<string, unknown>;
  revenue_range: Record<string, unknown>;
}
