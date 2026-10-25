/**
 * Verifies the Azure OpenAI configuration with one minimal request: the endpoint
 * is reachable, the key is accepted, the deployment exists and answers in JSON
 * mode, and how much rate-limit quota remains. A model listed in the Azure
 * catalog is not necessarily deployed; this checks the configured deployment.
 *
 * Usage: npm run verify-azure
 */
import OpenAI from "openai";
import { getSettings } from "@/server/core/config";
import { errorMessage } from "@/server/core/errors";

async function main(): Promise<number> {
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

main().then((code) => process.exit(code));
