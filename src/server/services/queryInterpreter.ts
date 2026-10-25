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
  /** For each field in `filters`, the words of the request it was taken from (shown to the user). */
  evidence: Record<string, string>;
  /** Related filter values the user may also want (never ones already in `filters`); options of multi fields only. */
  suggestions: { key: string; value: string }[];
}

const MAX_SUGGESTIONS = 8;

const modelOutputSchema = z.object({
  filters: z.record(z.string(), z.union([z.array(z.union([z.string(), z.number(), z.boolean()])), z.string(), z.boolean()])).default({}),
  remaining_query: z.string().nullable().default(""),
  suggestions: z.array(z.object({ key: z.string(), value: z.union([z.string(), z.number()]) })).default([]),
  evidence: z.record(z.string(), z.string()).default({}),
});

const SYSTEM_PROMPT = `You turn a B2B prospect search request into search filters. The results are always PEOPLE (contacts); company words describe the companies those people work at.

You receive the request and the available filter fields, each with its key, label, kind and options. Return strict JSON:
{"filters": {"<field key>": ["<value>", ...]}, "remaining_query": "<criteria no field can express, or empty>", "suggestions": [{"key": "<field key>", "value": "<option>"}, ...], "evidence": {"<field key>": "<the exact words of the request this field came from>"}}

Rules:
- Use only the given field keys. For "multi" fields return values copied exactly from that field's options. A field marked allow_custom may also take short free values (job titles, company names) when no option fits.
- "toggle" fields take ["true"] when the request asks for it (e.g. "with verified emails", "with phone numbers"); otherwise leave them out. "choice" fields take exactly one of their options.
- Map words onto option values: "United States", "US", "USA" → the matching location option; "51-200 employees" → '51 to 200'; "leaders", "heads", "executives", "decision makers" → seniorities 'C-Team', 'VP', 'Director'; "managers" → 'Manager'; a department ("marketing", "sales", "engineering") → the matching department option; a specific title ("CTOs", "CMOs", "founders") → the matching persona option.
- A sector named after a business function ("the Marketing sector", "sales companies", "HR firms") sets both the matching industries and the matching department.
- Industries are LinkedIn industries: "marketing agencies", "marketing companies", "marketing sector" → 'Marketing Services' and 'Advertising Services' (when they are options); "SaaS", "software" → 'Software Development'; "fintech" → 'Financial Services'. A department name is never an industry.
- A location applies to the person's location field unless the request says headquartered/based for the company.
- Fill every field the request speaks to. When it names a role or job title ("Marketing Directors", "VP Sales", "Head of Growth", "CTOs"), set ALL of: titles (the role as written plus its common spellings, e.g. ["VP Sales", "VP of Sales", "Vice President of Sales", "Vice President Sales"]), seniorities (its level), departments (its function) and functions/persona (the matching persona options, e.g. 'Sales Leadership' for VP Sales, 'Marketing Leadership' for marketing directors, 'CIO / CTO / Technology Executive' for CTOs).
- Changed jobs: "new in role", "recently changed jobs", "joined in the last N days/months" → the closest jobChange option.
- Values within one field combine with OR; different fields with AND.
- Add nothing the request doesn't say. Never guess values that are not options (except allow_custom fields).
- suggestions: up to 6 related values the user might also want to add, from the "multi" fields' options only and never already in filters: adjacent industries (e.g. 'Public Relations and Communications Services' next to 'Marketing Services'), the neighbouring seniority level, related personas or departments, the next company-size band. Only closely related values; [] when nothing fits.
- evidence: for every field you set in filters, quote the exact words of the request it came from (copied verbatim, e.g. "Marketing Directors", "in the United States", "changed jobs in the last 90 days").
- remaining_query: a short phrase with only the criteria that no field could express (e.g. "recently raised a Series B"); "" when everything was mapped. Don't repeat mapped criteria there.`;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Keeps only values a field accepts: exact options (matched case-insensitively), or short custom values where allowed. */
export function sanitizeInterpretation(raw: z.infer<typeof modelOutputSchema>, fields: InterpretRequest["fields"], requestQuery = ""): InterpretResult {
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
  // Suggestions must be real options of a multi field and not already selected.
  const suggestions: InterpretResult["suggestions"] = [];
  for (const suggestion of raw.suggestions) {
    const field = fields.find((f) => f.key === suggestion.key && f.kind === "multi");
    const option = field?.options.find((o) => normalize(o) === normalize(String(suggestion.value)));
    if (!field || !option || filters[field.key]?.includes(option)) continue;
    if (suggestions.some((s) => s.key === field.key && s.value === option)) continue;
    suggestions.push({ key: field.key, value: option });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  // Evidence is kept only for fields that were set, and only when the words really occur in the request.
  const evidence: Record<string, string> = {};
  const query = normalize(requestQuery);
  for (const [key, phrase] of Object.entries(raw.evidence)) {
    const words = phrase.trim().slice(0, 120);
    if (filters[key] && words && query.includes(normalize(words))) evidence[key] = words;
  }
  // Words already turned into a filter aren't also "searched as text".
  let remaining = (raw.remaining_query ?? "").trim().slice(0, 500);
  if (Object.values(evidence).some((words) => normalize(words) === normalize(remaining))) remaining = "";
  return { filters, remaining_query: remaining, suggestions, evidence };
}

/** Offline interpretation for the mock provider: options mentioned verbatim in the request. */
function interpretOffline(request: InterpretRequest): InterpretResult {
  const text = normalize(request.query);
  const filters: Record<string, string[]> = {};
  const evidence: Record<string, string> = {};
  for (const field of request.fields) {
    if (field.kind !== "multi") continue;
    const hits = field.options.filter((option) => option.length >= 3 && text.includes(normalize(option)));
    if (hits.length > 0) {
      filters[field.key] = hits;
      evidence[field.key] = hits.join(", ");
    }
  }
  return { filters, remaining_query: Object.keys(filters).length > 0 ? "" : request.query, suggestions: [], evidence };
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
      return sanitizeInterpretation(modelOutputSchema.parse(parseFencedJson(text)), request.fields, request.query);
    } catch (err) {
      logger.warn(`Interpreter output was malformed: ${errorMessage(err)}. Raw: ${text.slice(0, 500)}`);
      throw new Error("The request couldn't be turned into filters. Try rephrasing it, or search the text as typed.");
    }
  }
}

export const queryInterpreter = new QueryInterpreter();
