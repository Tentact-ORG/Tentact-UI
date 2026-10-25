import Anthropic from "@anthropic-ai/sdk";
import { getSettings } from "../core/config";
import { getLogger } from "../core/logger";

const logger = getLogger("leadgen.llm_adapter");

const MOCK_MODEL = "mock-advanced-sql";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
// Models that accept the server-side `fallbacks: "default"` refusal fallback on the Claude API.
const DEFAULT_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

/** Provider failure with a message that is safe to surface to API clients (no URLs or keys). */
export class LLMProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMProviderError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  payload: unknown,
  timeoutSec: number,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutSec * 1000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new LLMProviderError(`LLM provider '${provider}' request timed out after ${timeoutSec}s`);
    }
    throw new LLMProviderError(`LLM provider '${provider}' request failed: network error`);
  }
}

async function ensureOk(provider: string, resp: Response): Promise<void> {
  if (resp.ok) return;
  const body = await resp.text().catch(() => "");
  logger.warn(`LLM provider '${provider}' returned HTTP ${resp.status}: ${body.slice(0, 500)}`);
  throw new LLMProviderError(`LLM provider '${provider}' request failed with HTTP ${resp.status}`);
}

function requireKey(name: string, value: string | null): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/**
 * Provider-independent LLM client supporting a deterministic offline mock, Groq,
 * OpenAI (or compatible), Anthropic and Google Gemini.
 */
export class LLMAdapter {
  async generateCompletion(systemPrompt: string, userPrompt: string, temperature?: number, timeoutSec?: number): Promise<string> {
    const s = getSettings();
    const provider = s.LLM_PROVIDER.toLowerCase();
    const temp = temperature ?? s.LLM_TEMPERATURE;
    const timeout = timeoutSec ?? s.LLM_TIMEOUT_SEC;

    switch (provider) {
      case "mock":
        return this.generateMock(systemPrompt, userPrompt);
      case "groq":
        return this.generateGroq(systemPrompt, userPrompt, temp, timeout);
      case "openai":
        return this.generateOpenAI(systemPrompt, userPrompt, temp, timeout);
      case "anthropic":
        return this.generateAnthropic(systemPrompt, userPrompt, timeout);
      case "gemini":
        return this.generateGemini(systemPrompt, userPrompt, temp, timeout);
      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  private async generateGroq(system: string, user: string, temperature: number, timeout: number): Promise<string> {
    const s = getSettings();
    const apiKey = requireKey("GROQ_API_KEY", s.GROQ_API_KEY);
    const model = [MOCK_MODEL, "gpt-4o-mini"].includes(s.LLM_MODEL) ? "openai/gpt-oss-120b" : s.LLM_MODEL;
    const payload = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      response_format: { type: "json_object" },
    };

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const resp = await postJson(
        "groq",
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${apiKey}` },
        payload,
        timeout,
      );
      if (resp.status === 429 && attempt < maxAttempts - 1) {
        const retryHeader = Number(resp.headers.get("retry-after"));
        const waitSec = Math.max(Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 3 * (attempt + 1), 2.5);
        logger.warn(
          `Groq rate limit (429) encountered. Backing off ${waitSec.toFixed(1)}s (attempt ${attempt + 1}/${maxAttempts})...`,
        );
        await sleep(waitSec * 1000);
        continue;
      }
      await ensureOk("groq", resp);
      const data = (await resp.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content;
    }
    throw new LLMProviderError("Groq requests exhausted after retries.");
  }

  private async generateOpenAI(system: string, user: string, temperature: number, timeout: number): Promise<string> {
    const s = getSettings();
    const apiKey = requireKey("OPENAI_API_KEY", s.OPENAI_API_KEY);
    const baseUrl = (s.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const resp = await postJson(
      "openai",
      `${baseUrl}/chat/completions`,
      { Authorization: `Bearer ${apiKey}` },
      {
        model: s.LLM_MODEL !== MOCK_MODEL ? s.LLM_MODEL : "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        response_format: { type: "json_object" },
      },
      timeout,
    );
    await ensureOk("openai", resp);
    const data = (await resp.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0].message.content;
  }

  /**
   * Anthropic Messages API via the official SDK. Sampling parameters (temperature) are no
   * longer accepted by the Messages API, so LLM_TEMPERATURE does not apply here.
   */
  private async generateAnthropic(system: string, user: string, timeout: number): Promise<string> {
    const s = getSettings();
    const apiKey = requireKey("ANTHROPIC_API_KEY", s.ANTHROPIC_API_KEY);
    const model = s.LLM_MODEL !== MOCK_MODEL ? s.LLM_MODEL : DEFAULT_ANTHROPIC_MODEL;
    const client = new Anthropic({ apiKey, timeout: timeout * 1000 });
    const useFallbacks = DEFAULT_FALLBACK_MODELS.has(model);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: user }],
        ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        throw new LLMProviderError(`LLM provider 'anthropic' request timed out after ${timeout}s`);
      }
      if (err instanceof Anthropic.APIError) {
        logger.warn(`LLM provider 'anthropic' returned HTTP ${err.status ?? "n/a"}: ${err.message.slice(0, 500)}`);
        throw new LLMProviderError(`LLM provider 'anthropic' request failed with HTTP ${err.status ?? "error"}`);
      }
      throw err;
    }

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new LLMProviderError(`LLM provider 'anthropic' declined the request (refusal category: ${category})`);
    }
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (!text) throw new LLMProviderError("LLM provider 'anthropic' returned no text content");
    return text;
  }

  private async generateGemini(system: string, user: string, temperature: number, timeout: number): Promise<string> {
    const s = getSettings();
    const apiKey = requireKey("GEMINI_API_KEY", s.GEMINI_API_KEY);
    const modelName = s.LLM_MODEL !== MOCK_MODEL ? s.LLM_MODEL : "gemini-1.5-pro";
    const resp = await postJson(
      "gemini",
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      // Key sent as a header (not a query parameter) so it never appears in logged URLs.
      { "x-goog-api-key": apiKey },
      {
        contents: [{ role: "user", parts: [{ text: `${system}\n\nTask:\n${user}` }] }],
        generationConfig: { temperature, responseMimeType: "application/json" },
      },
      timeout,
    );
    await ensureOk("gemini", resp);
    const data = (await resp.json()) as { candidates: { content: { parts: { text: string }[] } }[] };
    return data.candidates[0].content.parts[0].text;
  }

  /** Deterministic offline generator/reviewer used for tests and standalone development. */
  private generateMock(systemPrompt: string, userPrompt: string): string {
    return systemPrompt.toLowerCase().includes("sql reviewer") ? mockReviewer(userPrompt) : mockGenerator(userPrompt);
  }
}

function mockGenerator(userPrompt: string): string {
  // Only the user request section matters (ignore schema catalog, samples and trailing instructions).
  let userReqPart = "";
  if (userPrompt.includes("User Search Request:")) {
    userReqPart = userPrompt.split("User Search Request:")[1];
    if (userReqPart.includes("Generate the ClickHouse SQL")) {
      userReqPart = userReqPart.split("Generate the ClickHouse SQL")[0];
    }
  }
  const p = (userReqPart || userPrompt).toLowerCase();
  const db = getSettings().CLICKHOUSE_DATABASE;

  const isContactSearch =
    p.includes('"search_target": "contact"') ||
    p.includes("search_target: contact") ||
    (!p.includes('"search_target": "company"') && ["contacts", "person", "people"].some((t) => p.includes(t)));

  if (p.includes("ambiguous") || (p.includes("all leads") && p.trim().length < 40)) {
    return JSON.stringify({
      clickhouse_sql: "",
      count_sql: "",
      parameters: {},
      search_target: "company",
      target_tables: [`${db}.synthetic_companies`],
      required_joins: [],
      selected_fields: ["company_id", "name"],
      assumptions: ["Request is highly ambiguous; clarify whether company or contact entities are desired."],
      unresolved_ambiguities: ["Please specify target entity (Companies or Contacts) and specific criteria."],
      notes: "Clarification required from user.",
    });
  }

  // Security test triggers: unapproved table access.
  if (p.includes("synthetic_raw_events") || p.includes("unapproved")) {
    return JSON.stringify({
      clickhouse_sql: `SELECT event_id, raw_payload FROM ${db}.synthetic_raw_events LIMIT 10`,
      count_sql: `SELECT count() FROM ${db}.synthetic_raw_events`,
      parameters: {},
      search_target: "company",
      target_tables: [`${db}.synthetic_raw_events`],
      required_joins: [],
      selected_fields: ["event_id", "raw_payload"],
      assumptions: ["Testing access to raw events table"],
      unresolved_ambiguities: [],
      notes: "Attempting unapproved table query",
    });
  }

  if (isContactSearch) {
    const where = ["ct.is_verified = 1"];
    const join = `INNER JOIN ${db}.synthetic_companies AS c ON ct.company_id = c.company_id`;

    if (p.includes("united states") || p.includes("usa")) where.push("ct.country = 'United States'");
    else if (p.includes("germany")) where.push("ct.country = 'Germany'");
    else if (p.includes("united kingdom") || p.includes("uk")) where.push("ct.country = 'United Kingdom'");
    else if (p.includes("canada")) where.push("ct.country = 'Canada'");

    if (p.includes("saas")) where.push("c.industry = 'SaaS'");
    else if (p.includes("fintech")) where.push("c.industry = 'Fintech'");
    else if (p.includes("healthcare")) where.push("c.industry = 'Healthcare'");
    else if (p.includes("ecommerce") || p.includes("e-commerce")) where.push("c.industry = 'E-Commerce'");

    if (p.includes("vp")) where.push("ilike(ct.job_title, '%VP%')");
    else if (p.includes("director")) where.push("ilike(ct.job_title, '%Director%')");
    else if (p.includes("engineer") || p.includes("cto")) {
      where.push("(ilike(ct.job_title, '%Engineer%') OR ilike(ct.job_title, '%CTO%'))");
    }

    const whereStr = where.join(" AND ");
    const sql = [
      "SELECT",
      "    ct.contact_id,",
      "    ct.first_name,",
      "    ct.last_name,",
      "    ct.full_name,",
      "    ct.job_title,",
      "    ct.seniority_level,",
      "    ct.department,",
      "    ct.work_email,",
      "    ct.country,",
      "    ct.company_id,",
      "    c.name AS company_name,",
      "    c.industry AS company_industry",
      `FROM ${db}.synthetic_contacts AS ct`,
      join,
      `WHERE ${whereStr}`,
      "ORDER BY ct.contact_id ASC",
      "LIMIT 25 OFFSET 0",
    ].join("\n");
    const countSql = [`SELECT count(DISTINCT ct.contact_id)`, `FROM ${db}.synthetic_contacts AS ct`, join, `WHERE ${whereStr}`].join(
      "\n",
    );
    return JSON.stringify({
      clickhouse_sql: sql,
      count_sql: countSql,
      parameters: {},
      search_target: "contact",
      target_tables: [`${db}.synthetic_contacts`, `${db}.synthetic_companies`],
      required_joins: [`${db}.synthetic_contacts.company_id = ${db}.synthetic_companies.company_id`],
      selected_fields: ["contact_id", "full_name", "job_title", "work_email", "company_name"],
      assumptions: ["Filtered to verified contacts by default."],
      unresolved_ambiguities: [],
      notes: "Generated contact search joining company details via approved relationship.",
    });
  }

  // Company search
  const where = ["1=1"];
  const assumptions: string[] = [];

  for (const industry of ["SaaS", "Fintech", "Healthcare", "E-Commerce", "Cybersecurity", "CleanTech", "EdTech"]) {
    if (p.includes(industry.toLowerCase())) {
      where.push(`c.industry = '${industry}'`);
      break;
    }
  }
  for (const country of ["United States", "Germany", "United Kingdom", "France", "Canada", "India"]) {
    if (p.includes(country.toLowerCase()) || (country === "United States" && (p.includes("usa") || p.includes(" us ")))) {
      where.push(`c.country = '${country}'`);
      break;
    }
  }

  const empMatch = /(\d+)\s*(?:\+|plus|more than|employees)/.exec(p);
  if (empMatch) {
    where.push(`c.employee_count >= ${empMatch[1]}`);
  } else if (p.includes("employee_count > 100") || p.includes("> 100 employees") || p.includes("100+")) {
    where.push("c.employee_count >= 100");
  }

  if (p.includes("revenue") && p.includes("10")) where.push("c.annual_revenue_usd >= 10000000.0");

  for (const tech of ["React", "Python", "ClickHouse", "AWS", "Kubernetes", "PostgreSQL", "Docker", "Node.js"]) {
    if (p.includes(tech.toLowerCase())) {
      where.push(`has(c.technologies, '${tech}')`);
      assumptions.push(`Used ClickHouse has() function for array column technologies with '${tech}'.`);
    }
  }

  // Contact criteria within a company search: IN subquery avoids join-expansion inflating counts.
  if (p.includes("vp") || p.includes("director") || p.includes("cto")) {
    const subTitle = p.includes("vp") ? "%VP%" : p.includes("director") ? "%Director%" : "%CTO%";
    where.push(
      `c.company_id IN (SELECT ct.company_id FROM ${db}.synthetic_contacts AS ct WHERE ilike(ct.job_title, '${subTitle}'))`,
    );
    assumptions.push("Used IN subquery to avoid join-expansion inflating company counts.");
  }

  const whereStr = where.join(" AND ");
  const sql = [
    "SELECT",
    "    c.company_id,",
    "    c.name,",
    "    c.domain,",
    "    c.industry,",
    "    c.country,",
    "    c.city,",
    "    c.employee_count,",
    "    c.annual_revenue_usd,",
    "    c.technologies,",
    "    c.funding_stage",
    `FROM ${db}.synthetic_companies AS c`,
    `WHERE ${whereStr}`,
    "ORDER BY c.company_id ASC",
    "LIMIT 25 OFFSET 0",
  ].join("\n");
  const countSql = [`SELECT count(DISTINCT c.company_id)`, `FROM ${db}.synthetic_companies AS c`, `WHERE ${whereStr}`].join("\n");
  return JSON.stringify({
    clickhouse_sql: sql,
    count_sql: countSql,
    parameters: {},
    search_target: "company",
    target_tables: [`${db}.synthetic_companies`],
    required_joins: [],
    selected_fields: ["company_id", "name", "domain", "industry", "country", "employee_count"],
    assumptions,
    unresolved_ambiguities: [],
    notes: "Generated standard company search query with distinct company counts.",
  });
}

function reviewerVerdict(fields: {
  verdict: string;
  satisfies_request: boolean;
  schema_matched: boolean;
  joins_approved: boolean;
  security_passed: boolean;
  is_read_only: boolean;
  has_correct_grain: boolean;
  issues: string[];
  reasoning: string;
  clarification_question?: string | null;
}): string {
  return JSON.stringify({ ...fields, clarification_question: fields.clarification_question ?? null });
}

function mockReviewer(userPrompt: string): string {
  let sqlPart = "";
  if (userPrompt.includes("Generated ClickHouse SQL:")) {
    const rest = userPrompt.split("Generated ClickHouse SQL:")[1];
    sqlPart = rest.includes("Generated Count SQL:") ? rest.split("Generated Count SQL:")[0] : rest;
  }
  const q = (sqlPart || userPrompt).toLowerCase();
  const p = userPrompt.toLowerCase();

  if (q.includes("synthetic_raw_events")) {
    return reviewerVerdict({
      verdict: "REJECTED",
      satisfies_request: false,
      schema_matched: false,
      joins_approved: false,
      security_passed: false,
      is_read_only: true,
      has_correct_grain: false,
      issues: ["Query references unapproved table 'synthetic_raw_events'."],
      reasoning: "The table 'synthetic_raw_events' is not approved in the schema registry.",
    });
  }

  if (["drop ", "delete ", "insert ", "update ", "alter "].some((w) => q.includes(w))) {
    return reviewerVerdict({
      verdict: "REJECTED",
      satisfies_request: false,
      schema_matched: false,
      joins_approved: false,
      security_passed: false,
      is_read_only: false,
      has_correct_grain: false,
      issues: ["Non-read-only statement detected."],
      reasoning: "Data modification statements are strictly prohibited.",
    });
  }

  if ((q.includes("confidential_arr") || q.includes("direct_phone")) && p.includes("role: member")) {
    return reviewerVerdict({
      verdict: "REJECTED",
      satisfies_request: true,
      schema_matched: true,
      joins_approved: true,
      security_passed: false,
      is_read_only: true,
      has_correct_grain: true,
      issues: ["Unauthorized access to restricted column."],
      reasoning: "The user role MEMBER is not authorized to select or filter on restricted column.",
    });
  }

  if (p.includes("clarify") || p.includes("ambiguous")) {
    return reviewerVerdict({
      verdict: "CLARIFICATION_REQUIRED",
      satisfies_request: false,
      schema_matched: true,
      joins_approved: true,
      security_passed: true,
      is_read_only: true,
      has_correct_grain: false,
      issues: ["Request has multiple conflicting interpretations."],
      reasoning: "User request is ambiguous.",
      clarification_question: "Do you want to search for companies or contacts?",
    });
  }

  return reviewerVerdict({
    verdict: "APPROVED",
    satisfies_request: true,
    schema_matched: true,
    joins_approved: true,
    security_passed: true,
    is_read_only: true,
    has_correct_grain: true,
    issues: [],
    reasoning: "SQL accurately implements the user criteria using approved schema and relationships.",
  });
}

export const llmAdapter = new LLMAdapter();
