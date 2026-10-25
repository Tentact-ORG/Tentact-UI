import { afterEach, describe, expect, it } from "vitest";
import { azureAnthropicBaseUrl, getSettings } from "@/server/core/config";
import { llmAdapter } from "@/server/services/llmAdapter";

describe("Claude on Azure AI Foundry", () => {
  it("derives the Foundry Anthropic base URL from either endpoint", () => {
    const base = "https://res.services.ai.azure.com/anthropic/";
    expect(azureAnthropicBaseUrl("https://res.services.ai.azure.com/anthropic", null)).toBe(base);
    expect(azureAnthropicBaseUrl("https://res.services.ai.azure.com/anthropic/v1/messages", null)).toBe(base);
    expect(azureAnthropicBaseUrl(null, "https://res.services.ai.azure.com/openai/v1")).toBe(base);
    expect(azureAnthropicBaseUrl(null, null)).toBeNull();
  });
});

describe("reviewer provider", () => {
  const settings = getSettings();
  afterEach(() => {
    Object.assign(settings, { LLM_REVIEWER_PROVIDER: null });
  });

  it("routes only the reviewer agent to LLM_REVIEWER_PROVIDER", async () => {
    Object.assign(settings, { LLM_REVIEWER_PROVIDER: "not-a-provider" });
    await expect(llmAdapter.generateCompletion("You are a SQL reviewer.", "{}", undefined, undefined, "reviewer")).rejects.toThrow(
      /Unsupported LLM provider: not-a-provider/,
    );
    // The generator still uses LLM_PROVIDER (the offline mock in tests).
    await expect(llmAdapter.generateCompletion("generator", "User Search Request: companies", undefined, undefined, "generator")).resolves.toContain(
      "clickhouse_sql",
    );
  });
});
