import { describe, expect, it } from "vitest";
import { POST as assistant } from "@/app/api/assistant/route";
import { callRoute } from "./helpers";

describe("POST /api/assistant", () => {
  it("answers visitors without signing in (offline mock provider)", async () => {
    const res = await callRoute(assistant, { method: "POST", headers: { "X-Forwarded-For": "198.51.100.10" }, body: { messages: [{ role: "user", content: "What is this?" }] } });
    expect(res.status).toBe(200);
    expect(res.body.reply).toEqual(expect.any(String));
    expect(typeof res.body.suggest_demo).toBe("boolean");
  });

  it("validates the conversation", async () => {
    const headers = { "X-Forwarded-For": "198.51.100.11" };
    expect((await callRoute(assistant, { method: "POST", headers, body: { messages: [] } })).status).toBe(422);
    expect((await callRoute(assistant, { method: "POST", headers, body: { messages: [{ role: "assistant", content: "hi" }] } })).status).toBe(422);
    expect((await callRoute(assistant, { method: "POST", headers, body: { messages: [{ role: "user", content: "x".repeat(601) }] } })).status).toBe(422);
  });

  it("limits each visitor", async () => {
    const headers = { "X-Forwarded-For": "198.51.100.12" };
    let last = 200;
    for (let i = 0; i < 25 && last !== 429; i++) {
      last = (await callRoute(assistant, { method: "POST", headers, body: { messages: [{ role: "user", content: "hi" }] } })).status;
    }
    expect(last).toBe(429);
  });
});
