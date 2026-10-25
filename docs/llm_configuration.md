# LLM Provider Configuration & Privacy Guidelines

The LeadGen AI Platform features a **provider-independent LLM architecture** (`src/server/services/llmAdapter.ts`). The business logic does not depend on any specific AI vendor, so providers can be switched through configuration.

---

## 1. Supported Providers

1. **`mock`** (default for tests and offline development)
   - Deterministic and local; no API keys, no network.
   - Models both Agent 1 (SQL Generator) and Agent 2 (SQL Reviewer) for the synthetic schema.

2. **`azure`** (Azure OpenAI / Azure AI Foundry)
   - Official `openai` SDK against the resource's v1 endpoint (`https://<resource>.services.ai.azure.com/openai/v1`), addressed by **deployment name**. No `api-version` is needed with the v1 endpoint.
   - Reasoning deployments (gpt-5 family, o-series) reject `temperature` and `max_tokens`: the adapter sends `max_completion_tokens`, an optional `reasoning_effort`, and a temperature only when `AZURE_OPENAI_TEMPERATURE` is set.
   - A model listed in the resource's catalog (`GET /models`) is not necessarily deployed. `npm run verify-azure` sends one minimal request to the configured deployment and reports the served model, JSON-mode support and remaining rate-limit quota.
   - Recommended configuration: deployment `gpt-5-mini`, `AZURE_OPENAI_REASONING_EFFORT=medium` for the generator and `AZURE_OPENAI_REVIEWER_REASONING_EFFORT=low` for the reviewer (about 16–22 s and 4–8 s per call, so 25–30 s for a fresh search; pages and repeats of an approved plan take under a second). Measured on the growstack warehouse, three fresh runs per query: "VP or Director level marketing people at software companies in the United States" returned 12,069 every time; "CTOs and engineering leaders at fintech companies in India with 51 to 200 employees" returned 955 / 932 / 932. With the generator at `low` the first query was unchanged and 5–8 s faster, but the second varied (549 / 1,141 / 618), so `medium` stays the default. A `model-router` deployment also works, but it may pick a different model for each call.

3. **`groq`**
   - OpenAI-compatible chat completions with JSON mode.
   - Default model when `LLM_MODEL` is left unset: `openai/gpt-oss-120b`.
   - Rate limits (HTTP 429) are retried up to 5 times, honouring `retry-after`.

4. **`openai`** (or any OpenAI-compatible endpoint via `OPENAI_BASE_URL`)
   - Uses JSON mode (`response_format: { type: "json_object" }`). Default model: `gpt-4o-mini`.

5. **`anthropic`**
   - Uses the official `@anthropic-ai/sdk`. Default model: `claude-opus-5-5`.
   - Sampling parameters are not sent (`LLM_TEMPERATURE` does not apply); responses may include thinking blocks, and only the text content is used.
   - For models that support it, server-side refusal fallback (`fallbacks: "default"`) is enabled so a declined request is retried on Anthropic's recommended fallback model; a refusal that still stands is reported as an error.

6. **`azure-anthropic`** (Claude on Azure AI Foundry)
   - Official `@anthropic-ai/foundry-sdk` against `https://<resource>.services.ai.azure.com/anthropic/`, authenticated with the resource key (`x-api-key`); the model is the **deployment name** (`AZURE_ANTHROPIC_DEPLOYMENT`).
   - No sampling parameters are sent. Foundry has no server-side refusal fallback, so a refusal (`stop_reason: "refusal"`) or a truncated answer (`max_tokens`) is reported as a provider error and the search pipeline retries or fails safely.
   - Endpoint and key default to the `AZURE_OPENAI_*` resource. `npm run verify-azure` checks the Claude deployment as well.
   - Tested: `claude-haiku-4-5` on the same resource as `gpt-5-mini` works (about 1.5 s for a minimal request, 4–12 s per review). As the SQL reviewer it was less reliable than `gpt-5-mini` at `low` effort: on the fintech query above it rejected valid queries (calling the `company_data` lookup an unapproved join, adding criteria the request didn't state), and only 1 of 3 runs succeeded, against 3 of 3 for `gpt-5-mini`. Keep the reviewer on `azure` unless a stronger Claude deployment is available, and measure before switching.

7. **`gemini`**
   - Uses structured generation (`responseMimeType: "application/json"`). Default model: `gemini-1.5-pro`; set `LLM_MODEL` to a currently available Gemini model.
   - The API key is sent in the `x-goog-api-key` header, never in the URL.

---

## 2. Configuration Examples

### Azure OpenAI
```bash
LLM_PROVIDER=azure
LLM_TIMEOUT_SEC=60
AZURE_OPENAI_ENDPOINT=https://<resource>.services.ai.azure.com/openai/v1
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_REASONING_EFFORT=medium
AZURE_OPENAI_REVIEWER_REASONING_EFFORT=low
```

### Claude as an independent reviewer
The generator and the reviewer are separate agents; the reviewer can run on a different model family so it doesn't share the generator's blind spots. Every reviewed query still passes the deterministic validator and runs read-only, whichever model approved it.
```bash
LLM_PROVIDER=azure                      # generator: gpt-5-mini (above)
LLM_REVIEWER_PROVIDER=azure-anthropic   # reviewer: Claude on the same resource (measure first, see above)
AZURE_ANTHROPIC_DEPLOYMENT=claude-haiku-4-5
```

### Groq
```bash
LLM_PROVIDER=groq
LLM_MODEL=openai/gpt-oss-120b
GROQ_API_KEY=gsk_...
```

### OpenAI
```bash
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

### Anthropic
```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-opus-5-5
ANTHROPIC_API_KEY=sk-ant-...
```

### Gemini
```bash
LLM_PROVIDER=gemini
LLM_MODEL=<gemini model id>
GEMINI_API_KEY=AIza...
```

---

## 3. Privacy & Minimal Data Exposure

- **No raw lead rows or personal contact data** are ever sent to LLMs.
- Prompts contain only discovered table and column names, column types and sensitivity tiers, approved relationships, the value lists of small categorical columns in approved tables (job levels, functions, employee bands…; restricted columns are never included), the names of columns that hold no data, and the deterministic access-control verdict for the query under review.
- API keys stay on the server; browsers never call LLM endpoints. Provider error responses are logged server-side and surfaced to clients only as a generic status message.
