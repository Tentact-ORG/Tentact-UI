import { z } from "zod";

export const sqlGeneratorOutputSchema = z.object({
  clickhouse_sql: z.string(),
  count_sql: z.string().nullable().default(null),
  parameters: z.record(z.string(), z.unknown()).default({}),
  search_target: z.string(), // "company" or "contact"
  target_tables: z.array(z.string()).default([]),
  required_joins: z.array(z.string()).default([]),
  selected_fields: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  unresolved_ambiguities: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
});
export type SQLGeneratorOutput = z.infer<typeof sqlGeneratorOutputSchema>;

export const SQLReviewerVerdict = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  CLARIFICATION_REQUIRED: "CLARIFICATION_REQUIRED",
} as const;
export type SQLReviewerVerdict = (typeof SQLReviewerVerdict)[keyof typeof SQLReviewerVerdict];

export const sqlReviewerOutputSchema = z.object({
  verdict: z.enum(["APPROVED", "REJECTED", "CLARIFICATION_REQUIRED"]),
  satisfies_request: z.boolean(),
  schema_matched: z.boolean(),
  joins_approved: z.boolean(),
  security_passed: z.boolean(),
  is_read_only: z.boolean(),
  has_correct_grain: z.boolean(),
  issues: z.array(z.string()).default([]),
  reasoning: z.string(),
  clarification_question: z.string().nullable().default(null),
});
export type SQLReviewerOutput = z.infer<typeof sqlReviewerOutputSchema>;

/**
 * Strips a surrounding ```json fence from an LLM response and parses the JSON body,
 * mirroring the agents' Python cleanup logic.
 */
export function parseFencedJson(responseText: string): unknown {
  let cleaned = responseText.trim();
  if (cleaned.startsWith("```")) {
    const newline = cleaned.indexOf("\n");
    cleaned = newline === -1 ? "" : cleaned.slice(newline + 1);
    if (cleaned.endsWith("```")) {
      const lastNewline = cleaned.lastIndexOf("\n");
      cleaned = lastNewline === -1 ? cleaned : cleaned.slice(0, lastNewline);
    }
  }
  return JSON.parse(cleaned);
}
