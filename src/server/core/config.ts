import { z } from "zod";
import { singleton } from "./singleton";

const DEV_JWT_SECRET = "leadgen_dev_local_secret_key_random_32_characters_long_for_tests";

/** Mirrors pydantic's lenient boolean parsing for environment variables. */
const envBool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === "") return fallback;
      const value = raw.trim().toLowerCase();
      if (["1", "true", "t", "yes", "y", "on"].includes(value)) return true;
      if (["0", "false", "f", "no", "n", "off"].includes(value)) return false;
      ctx.addIssue({ code: "custom", message: `Invalid boolean: '${raw}'` });
      return z.NEVER;
    });

const envInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === "") return fallback;
      const value = Number(raw);
      if (!Number.isInteger(value)) {
        ctx.addIssue({ code: "custom", message: `Invalid integer: '${raw}'` });
        return z.NEVER;
      }
      return value;
    });

const envFloat = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === "") return fallback;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: "custom", message: `Invalid number: '${raw}'` });
        return z.NEVER;
      }
      return value;
    });

const envStr = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((raw) => (raw === undefined ? fallback : raw));

const envOptionalStr = z
  .string()
  .optional()
  .transform((raw) => (raw === undefined || raw.trim() === "" ? null : raw));

const settingsSchema = z
  .object({
    APP_ENV: envStr("development"),
    LOG_LEVEL: envStr("INFO"),

    // Application database: `sqlite+aiosqlite:///./file.db` or `postgresql+asyncpg://...`
    DATABASE_URL: envStr("sqlite+aiosqlite:///./leadgen_app.db"),

    // ClickHouse lead warehouse
    CLICKHOUSE_MODE: z.enum(["client", "mock"]).default("client"),
    CLICKHOUSE_HOST: envStr("localhost"),
    CLICKHOUSE_PORT: envInt(8123),
    CLICKHOUSE_USER: envStr("default"),
    CLICKHOUSE_PASSWORD: envStr(""),
    CLICKHOUSE_DATABASE: envStr("leadgen_warehouse"),
    CLICKHOUSE_SECURE: envBool(false),
    CLICKHOUSE_VERIFY: envBool(true),
    CLICKHOUSE_CONNECT_TIMEOUT_SEC: envInt(10),
    CLICKHOUSE_QUERY_TIMEOUT_SEC: envInt(30),

    // JWT authentication
    JWT_SECRET_KEY: envStr(DEV_JWT_SECRET),
    JWT_ALGORITHM: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),
    ACCESS_TOKEN_EXPIRE_MINUTES: envInt(480),

    // CORS (only relevant for cross-origin API consumers; the bundled UI is same-origin)
    CORS_ORIGINS: envStr("http://localhost:3000,http://127.0.0.1:3000"),

    // LLM settings
    LLM_PROVIDER: envStr("mock"),
    LLM_MODEL: envStr("mock-advanced-sql"),
    LLM_TEMPERATURE: envFloat(0),
    LLM_TIMEOUT_SEC: envInt(25),
    GROQ_API_KEY: envOptionalStr,
    OPENAI_API_KEY: envOptionalStr,
    OPENAI_BASE_URL: envOptionalStr,
    ANTHROPIC_API_KEY: envOptionalStr,
    GEMINI_API_KEY: envOptionalStr,

    // Azure OpenAI (Azure AI Foundry v1 endpoint, e.g. https://<resource>.services.ai.azure.com/openai/v1)
    AZURE_OPENAI_ENDPOINT: envOptionalStr,
    AZURE_OPENAI_API_KEY: envOptionalStr,
    /** Deployment name, not the model name: the name chosen when the model was deployed. */
    AZURE_OPENAI_DEPLOYMENT: envOptionalStr,
    /** For reasoning deployments (gpt-5, o-series); leave unset for others. */
    AZURE_OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).optional(),
    /** Reasoning effort for the reviewer agent; defaults to AZURE_OPENAI_REASONING_EFFORT. */
    AZURE_OPENAI_REVIEWER_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).optional(),
    /** Only sent when set: reasoning deployments accept nothing but the default. */
    AZURE_OPENAI_TEMPERATURE: z
      .string()
      .optional()
      .transform((raw, ctx) => {
        if (raw === undefined || raw.trim() === "") return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) {
          ctx.addIssue({ code: "custom", message: `Invalid number: '${raw}'` });
          return z.NEVER;
        }
        return value;
      }),

    // Claude on Azure AI Foundry (provider "azure-anthropic"), e.g. as an independent reviewer agent.
    /** https://<resource>.services.ai.azure.com/anthropic; defaults to the AZURE_OPENAI_ENDPOINT resource. */
    AZURE_ANTHROPIC_ENDPOINT: envOptionalStr,
    /** Defaults to AZURE_OPENAI_API_KEY (the same Foundry resource accepts it). */
    AZURE_ANTHROPIC_API_KEY: envOptionalStr,
    /** Deployment name of the Claude model, e.g. claude-haiku-4-5. */
    AZURE_ANTHROPIC_DEPLOYMENT: envOptionalStr,
    /** Provider for the SQL reviewer agent; unset means LLM_PROVIDER. */
    LLM_REVIEWER_PROVIDER: envOptionalStr,

    // Credits: revealing or exporting contact details spends credits from the organization's balance.
    CREDITS_ENABLED: envBool(true),
    CREDITS_PER_CONTACT: envInt(1),
    /** Platform operators (sales/finance) who approve top-up requests and grant credits to any workspace. */
    CREDITS_OPERATOR_EMAILS: envStr(""),

    // CSV export settings
    EXPORT_MAX_ROWS: envInt(100000),
    EXPORT_EXPIRATION_HOURS: envInt(24),
    EXPORT_STORAGE_PATH: envStr("./exports_storage"),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.AZURE_OPENAI_ENDPOINT && !/^https:\/\/[^/]+\/openai\/v1\/?$/.test(cfg.AZURE_OPENAI_ENDPOINT)) {
      ctx.addIssue({
        code: "custom",
        path: ["AZURE_OPENAI_ENDPOINT"],
        message: "Expected the v1 endpoint, e.g. https://<resource>.services.ai.azure.com/openai/v1",
      });
    }
    if (cfg.AZURE_ANTHROPIC_ENDPOINT && !/^https:\/\/[^/]+\/anthropic(\/v1(\/messages)?)?\/?$/.test(cfg.AZURE_ANTHROPIC_ENDPOINT)) {
      ctx.addIssue({
        code: "custom",
        path: ["AZURE_ANTHROPIC_ENDPOINT"],
        message: "Expected the Foundry Anthropic endpoint, e.g. https://<resource>.services.ai.azure.com/anthropic",
      });
    }
    const providers = [cfg.LLM_PROVIDER, cfg.LLM_REVIEWER_PROVIDER ?? ""].map((p) => p.toLowerCase());
    if (
      providers.includes("azure-anthropic") &&
      (!(cfg.AZURE_ANTHROPIC_ENDPOINT || cfg.AZURE_OPENAI_ENDPOINT) || !(cfg.AZURE_ANTHROPIC_API_KEY || cfg.AZURE_OPENAI_API_KEY) || !cfg.AZURE_ANTHROPIC_DEPLOYMENT)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AZURE_ANTHROPIC_DEPLOYMENT"],
        message: "The azure-anthropic provider requires AZURE_ANTHROPIC_DEPLOYMENT and an endpoint and key (AZURE_ANTHROPIC_* or AZURE_OPENAI_*)",
      });
    }
    if (cfg.LLM_PROVIDER.toLowerCase() === "azure" && (!cfg.AZURE_OPENAI_ENDPOINT || !cfg.AZURE_OPENAI_API_KEY || !cfg.AZURE_OPENAI_DEPLOYMENT)) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_PROVIDER"],
        message: "LLM_PROVIDER=azure requires AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT",
      });
    }
    if (cfg.APP_ENV === "production" && (cfg.JWT_SECRET_KEY === DEV_JWT_SECRET || cfg.JWT_SECRET_KEY.length < 32)) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET_KEY"],
        message: "A unique JWT_SECRET_KEY of at least 32 characters is required when APP_ENV=production",
      });
    }
  });

export type Settings = z.infer<typeof settingsSchema> & {
  readonly corsOriginsList: string[];
  /** Lower-cased emails of the credit operators. */
  readonly creditOperatorEmails: string[];
  /** Base URL for the Foundry Anthropic client (https://<resource>.services.ai.azure.com/anthropic/), or null. */
  readonly azureAnthropicBaseUrl: string | null;
  readonly backgroundTasksEnabled: boolean;
};

/** The Foundry resource's Anthropic base URL, from AZURE_ANTHROPIC_ENDPOINT or the same resource as AZURE_OPENAI_ENDPOINT. */
export function azureAnthropicBaseUrl(endpoint: string | null, openaiEndpoint: string | null): string | null {
  if (endpoint) return `${endpoint.replace(/\/+$/, "").replace(/\/v1(\/messages)?$/, "")}/`;
  return openaiEndpoint ? `${new URL(openaiEndpoint).origin}/anthropic/` : null;
}

function loadSettings(): Settings {
  const env = { ...process.env };
  // Accept the CLICKHOUSE_USERNAME alias, as the Python settings did.
  if (env.CLICKHOUSE_USER === undefined && env.CLICKHOUSE_USERNAME !== undefined) {
    env.CLICKHOUSE_USER = env.CLICKHOUSE_USERNAME;
  }
  const parsed = settingsSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid application configuration: ${problems}`);
  }
  const cfg = parsed.data;
  return {
    ...cfg,
    corsOriginsList: cfg.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
    creditOperatorEmails: cfg.CREDITS_OPERATOR_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
    azureAnthropicBaseUrl: azureAnthropicBaseUrl(cfg.AZURE_ANTHROPIC_ENDPOINT, cfg.AZURE_OPENAI_ENDPOINT),
    backgroundTasksEnabled: cfg.APP_ENV !== "test",
  };
}

export function getSettings(): Settings {
  return singleton("settings", loadSettings);
}
