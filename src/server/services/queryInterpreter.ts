import { z } from "zod";
import { getSettings } from "../core/config";
import { errorMessage } from "../core/errors";
import { getLogger } from "../core/logger";
import { parseFencedJson } from "../schemas/agent";
import { llmAdapter } from "./llmAdapter";

/**
 * Turns a free-text prospect request ("VP marketing at SaaS companies in the US
 * with 51-200 employees") into the dashboard's filters, so the user can review
 * and adjust them before searching. The model only proposes values; every value
 * is checked against the field's options here, and anything no filter can
 * express is handed back as remaining free text for the SQL generator.
 */

const logger = getLogger("leadgen.query_interpreter");

const MAX_OPTIONS = 600;
const MAX_CUSTOM_VALUES = 10;

export const interpretRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  fields: z
    .array(
      z.object({
        key: z.string().regex(/^[a-zA-Z]+$/).max(40),
        label: z.string().max(60),
        kind: z.enum(["multi", "toggle", "choice"]),
        options: z.array(z.string().max(200)).max(MAX_OPTIONS).default([]),
        allow_custom: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(30),
});
export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

export interface InterpretResult {
  /** Field key → selected values: options of multi fields, "true" for toggles, the chosen option for choices. */
  filters: Record<string, string[]>;
  /** Criteria no field expresses, kept as the free-text query (empty when everything became a filter). */
  remaining_query: string;
}

const modelOutputSchema = z.object({
  filters: z.record(z.string(), z.union([z.array(z.union([z.string(), z.number(), z.boolean()])), z.string(), z.boolean()])).default({}),
  remaining_query: z.string().nullable().default(""),
});

const SYSTEM_PROMPT = `You turn a B2B prospect search request into search filters. The results are always PEOPLE (contacts); company words describe the companies those people work at.

You receive the request and the available filter fields, each with its key, label, kind and options. Return strict JSON:
{"filters": {"<field key>": ["<value>", ...]}, "remaining_query": "<criteria no field can express, or empty>"}

Rules:
- Use only the given field keys. For "multi" fields return values copied exactly from that field's options. A field marked allow_custom may also take short free values (job titles, company names) when no option fits.
- "toggle" fields take ["true"] when the request asks for it (e.g. "with verified emails", "with phone numbers"); otherwise leave them out. "choice" fields take exactly one of their options.
- Map words onto option values: "United States", "US", "USA" → the matching location option; "51-200 employees" → '51 to 200'; "leaders", "heads", "executives", "decision makers" → seniorities 'C-Team', 'VP', 'Director'; "managers" → 'Manager'; a department ("marketing", "sales", "engineering") → the matching department option; a specific title ("CTOs", "CMOs", "founders") → the matching persona option.
- Industries are LinkedIn industries: "marketing agencies", "marketing companies", "marketing sector" → 'Marketing Services' and 'Advertising Services' (when they are options); "SaaS", "software" → 'Software Development'; "fintech" → 'Financial Services'. A department name is never an industry.
- A location applies to the person's location field unless the request says headquartered/based for the company.
- Different fields combine with AND, values within one field with OR. Express each idea in one field only: don't add a job title when seniority, department or persona already captures it ("VP sales" → seniority 'VP' + the sales department, no title). When the request names alternatives that would need different fields ("CTOs and engineering leaders"), use the field that covers all of them (seniorities 'C-Team', 'VP', 'Director' + department 'Engineering' covers CTOs too) instead of ANDing them.
- Add nothing the request doesn't say. Never guess values that are not options (except allow_custom fields).
- remaining_query: a short phrase with only the criteria that no field could express (e.g. "recently raised a Series B"); "" when everything was mapped. Don't repeat mapped criteria there.`;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Keeps only values a field accepts: exact options (matched case-insensitively), or short custom values where allowed. */
export function sanitizeInterpretation(raw: z.infer<typeof modelOutputSchema>, fields: InterpretRequest["fields"]): InterpretResult {
  const filters: Record<string, string[]> = {};
  for (const field of fields) {
    const proposed = raw.filters[field.key];
    if (proposed === undefined) continue;
    const values = (Array.isArray(proposed) ? proposed : [proposed]).map((v) => String(v).trim()).filter(Boolean);
    const byNormal = new Map(field.options.map((option) => [normalize(option), option]));

    let accepted: string[];
    if (field.kind === "toggle") {
      accepted = values.some((v) => normalize(v) === "true") ? ["true"] : [];
    } else if (field.kind === "choice") {
      const choice = values.map((v) => byNormal.get(normalize(v))).find(Boolean);
      accepted = choice ? [choice] : [];
    } else {
      accepted = values
        .map((v) => byNormal.get(normalize(v)) ?? (field.allow_custom && v.length <= 100 ? v : undefined))
        .filter((v): v is string => v !== undefined)
        .slice(0, field.allow_custom ? MAX_CUSTOM_VALUES : field.options.length);
    }
    const unique = [...new Set(accepted)];
    if (unique.length > 0) filters[field.key] = unique;
  }
  return { filters, remaining_query: (raw.remaining_query ?? "").trim().slice(0, 500) };
}

/** Offline interpretation for the mock provider: options mentioned verbatim in the request. */
function interpretOffline(request: InterpretRequest): InterpretResult {
  const text = normalize(request.query);
  const filters: Record<string, string[]> = {};
  for (const field of request.fields) {
    if (field.kind !== "multi") continue;
    const hits = field.options.filter((option) => option.length >= 3 && text.includes(normalize(option)));
    if (hits.length > 0) filters[field.key] = hits;
  }
  return { filters, remaining_query: Object.keys(filters).length > 0 ? "" : request.query };
}

class QueryInterpreter {
  async interpret(request: InterpretRequest): Promise<InterpretResult> {
    if (getSettings().LLM_PROVIDER.toLowerCase() === "mock") return interpretOffline(request);

    const catalog = request.fields.map((field) => ({
      key: field.key,
      label: field.label,
      kind: field.kind,
      allow_custom: field.allow_custom,
      options: field.options,
    }));
    const user = `Filter fields:\n${JSON.stringify(catalog)}\n\nRequest: ${JSON.stringify(request.query)}\n\nReturn the JSON.`;
    const text = await llmAdapter.generateCompletion(SYSTEM_PROMPT, user, undefined, undefined, "interpreter");
    try {
      return sanitizeInterpretation(modelOutputSchema.parse(parseFencedJson(text)), request.fields);
    } catch (err) {
      logger.warn(`Interpreter output was malformed: ${errorMessage(err)}. Raw: ${text.slice(0, 500)}`);
      throw new Error("The request couldn't be turned into filters. Try rephrasing it, or search the text as typed.");
    }
  }
}

export const queryInterpreter = new QueryInterpreter();
