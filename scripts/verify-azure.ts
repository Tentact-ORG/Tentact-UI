/**
 * Verifies the Azure OpenAI configuration with one minimal request: the endpoint
 * is reachable, the key is accepted, the deployment exists and answers in JSON
 * mode, and how much rate-limit quota remains. A model listed in the Azure
 * catalog is not necessarily deployed; this checks the configured deployment.
 * When AZURE_ANTHROPIC_DEPLOYMENT is set, the Claude deployment is checked too.
 *
 * Usage: npm run verify-azure
 */
import { AnthropicFoundry } from "@anthropic-ai/foundry-sdk";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSettings } from "@/server/core/config";
import { errorMessage } from "@/server/core/errors";

/** One minimal request to the Claude deployment on the same Foundry resource. */
async function verifyClaude(): Promise<number> {
  const s = getSettings();
  const apiKey = s.AZURE_ANTHROPIC_API_KEY ?? s.AZURE_OPENAI_API_KEY;
  if (!s.azureAnthropicBaseUrl || !apiKey || !s.AZURE_ANTHROPIC_DEPLOYMENT) {
    console.error("Claude:     missing AZURE_ANTHROPIC_DEPLOYMENT, endpoint or key");
    return 1;
  }
  console.log(`\nClaude endpoint:   ${s.azureAnthropicBaseUrl}`);
  console.log(`Claude deployment: ${s.AZURE_ANTHROPIC_DEPLOYMENT}`);
  const client = new AnthropicFoundry({ apiKey, baseURL: s.azureAnthropicBaseUrl, timeout: 60_000, maxRetries: 0 });
  const started = Date.now();
  try {
    const message = await client.messages.create({
      model: s.AZURE_ANTHROPIC_DEPLOYMENT,
      max_tokens: 200,
      system: "Reply with a JSON object only.",
      messages: [{ role: "user", content: 'Return {"ok": true}.' }],
    });
    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    let ok = false;
    try {
      ok = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) !== null;
    } catch {
      // reported below
    }
    console.log(`Status:     OK (${Date.now() - started} ms), stop reason ${message.stop_reason}`);
    console.log(`Model:      ${message.model}`);
    console.log(`JSON reply: ${ok ? "working" : `unexpected reply: ${text.slice(0, 200)}`}`);
    console.log(`Tokens:     ${message.usage.input_tokens} in / ${message.usage.output_tokens} out`);
    return ok ? 0 : 1;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const hint = err.status === 401 ? "the key was rejected by this resource" : err.status === 404 ? "no Claude deployment with this name" : "see the message above";
      console.error(`Status:     FAILED with HTTP ${err.status}: ${err.message.slice(0, 300)}\n            (${hint})`);
    } else {
      console.error(`Status:     FAILED: ${errorMessage(err)}`);
    }
    return 1;
  }
}

async function verifyOpenAI(): Promise<number> {
  const s = getSettings();
  const missing = (["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"] as const).filter((name) => !s[name]);
  if (missing.length > 0) {
    console.error(`Missing configuration: ${missing.join(", ")}`);
    return 1;
  }

  const endpoint = s.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, "");
  console.log(`Endpoint:   ${endpoint}`);
  console.log(`Deployment: ${s.AZURE_OPENAI_DEPLOYMENT}`);
  const client = new OpenAI({ apiKey: s.AZURE_OPENAI_API_KEY!, baseURL: endpoint, timeout: 60_000, maxRetries: 0 });

  const started = Date.now();
  try {
    const { data, response } = await client.chat.completions
      .create({
        model: s.AZURE_OPENAI_DEPLOYMENT!,
        messages: [
          { role: "system", content: "Reply with a JSON object only." },
          { role: "user", content: 'Return {"ok": true}.' },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
        ...(s.AZURE_OPENAI_REASONING_EFFORT ? { reasoning_effort: s.AZURE_OPENAI_REASONING_EFFORT } : {}),
        ...(s.AZURE_OPENAI_TEMPERATURE !== null ? { temperature: s.AZURE_OPENAI_TEMPERATURE } : {}),
      })
      .withResponse();

    const content = data.choices[0]?.message.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // reported below
    }
    console.log(`Status:     OK (${Date.now() - started} ms)`);
    console.log(`Model:      ${data.model}`);
    console.log(`JSON mode:  ${parsed !== null ? "working" : `unexpected reply: ${content.slice(0, 200)}`}`);
    console.log(`Tokens:     ${data.usage?.prompt_tokens ?? "?"} in / ${data.usage?.completion_tokens ?? "?"} out`);
    const limit = (name: string) => response.headers.get(`x-ratelimit-${name}`) ?? "n/a";
    console.log(`Quota:      ${limit("remaining-requests")}/${limit("limit-requests")} requests, ${limit("remaining-tokens")}/${limit("limit-tokens")} tokens per period`);
    return parsed !== null ? 0 : 1;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const hint =
        err.status === 401 ? "the API key was rejected" : err.status === 404 ? "no deployment with this name exists on the resource" : err.status === 429 ? "the deployment is out of quota" : "see the message above";
      console.error(`Status:     FAILED with HTTP ${err.status}: ${err.message.slice(0, 300)}\n            (${hint})`);
    } else {
      console.error(`Status:     FAILED: ${errorMessage(err)}`);
    }
    return 1;
  }
}

async function main(): Promise<number> {
  const openai = await verifyOpenAI();
  const claude = getSettings().AZURE_ANTHROPIC_DEPLOYMENT ? await verifyClaude() : 0;
  return openai || claude;
}

main().then((code) => process.exit(code));
