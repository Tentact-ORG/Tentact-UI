import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as status, POST as search } from "@/app/api/public-search/route";
import { resetSingleton } from "@/server/core/singleton";
import { runPublicProspectSearch, toPublicProspect } from "@/server/services/publicProspectSearch";
import { normalizeAddress, PublicSearchLimiter, setPublicSearchLimiterForTests, trustedClientAddress } from "@/server/services/publicSearchLimit";
import { searchOrchestrator } from "@/server/services/searchOrchestrator";
import { callRoute, seedTestData } from "./helpers";

// A real Postgres engine (PGlite) with the Supabase migrations applied.
let db: PGlite;

async function applyMigrations(target: PGlite) {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    await target.exec(readFileSync(path.join(dir, file), "utf8"));
  }
}

const newLimiter = (limit = 3) => new PublicSearchLimiter(db, limit, 24 * 3600, "test-ip-secret");

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
});

afterAll(async () => {
  setPublicSearchLimiterForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from public.public_search_attempts");
});

describe("PublicSearchLimiter (Postgres)", () => {
  it("allows 3 searches per address and blocks the 4th", async () => {
    const limiter = newLimiter();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume("203.0.113.5"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].resetsAt?.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });

  it("keeps the count across refreshes and server restarts (state lives in the database)", async () => {
    await newLimiter().consume("203.0.113.6");
    await newLimiter().consume("203.0.113.6");
    // A page refresh only reads the status, and a new limiter instance is a restarted server.
    expect((await newLimiter().status("203.0.113.6")).remaining).toBe(1);
    expect((await newLimiter().status("203.0.113.6")).remaining).toBe(1);
    expect((await newLimiter().consume("203.0.113.6")).allowed).toBe(true);
    expect((await newLimiter().consume("203.0.113.6")).allowed).toBe(false);
  });

  it("allows at most 3 of many simultaneous attempts", async () => {
    const limiter = newLimiter();
    const results = await Promise.all(Array.from({ length: 12 }, () => limiter.consume("203.0.113.7")));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    const { rows } = await db.query<{ attempts: number }>("select attempts from public.public_search_attempts");
    expect(rows).toEqual([{ attempts: 3 }]);
  });

  it("counts each address separately", async () => {
    const limiter = newLimiter();
    for (let i = 0; i < 3; i++) await limiter.consume("203.0.113.8");
    expect((await limiter.consume("203.0.113.8")).allowed).toBe(false);
    expect((await limiter.consume("203.0.113.9")).allowed).toBe(true);
  });

  it("starts a fresh window once 24 hours have passed", async () => {
    const limiter = newLimiter();
    for (let i = 0; i < 4; i++) await limiter.consume("203.0.113.10");
    await db.exec("update public.public_search_attempts set expires_at = now() - interval '1 second'");
    expect((await limiter.status("203.0.113.10")).remaining).toBe(3);
    const next = await limiter.consume("203.0.113.10");
    expect(next).toMatchObject({ allowed: true, used: 1, remaining: 2 });
  });

  it("gives back an attempt that didn't produce a search", async () => {
    const limiter = newLimiter();
    await limiter.consume("203.0.113.11");
    await limiter.consume("203.0.113.11");
    await limiter.refund("203.0.113.11");
    expect((await limiter.status("203.0.113.11")).remaining).toBe(2);
  });

  it("stores a keyed hash, never the address", async () => {
    await newLimiter().consume("203.0.113.12");
    const { rows } = await db.query<{ ip_hash: string }>("select ip_hash from public.public_search_attempts");
    expect(rows[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].ip_hash).not.toContain("203.0.113.12");
    // Without the secret the hash can't be recomputed from a guessed address.
    expect(new PublicSearchLimiter(db, 3, 86400, "another-secret").keyFor("203.0.113.12")).not.toBe(rows[0].ip_hash);
  });

  it("purges expired rows with the scheduled cleanup statement", async () => {
    await newLimiter().consume("203.0.113.13");
    await db.exec("update public.public_search_attempts set expires_at = now() - interval '1 minute'");
    await db.exec("delete from public.public_search_attempts where expires_at < now()");
    expect((await db.query("select 1 from public.public_search_attempts")).rows).toHaveLength(0);
  });
});

describe("visitor address", () => {
  const headers = (value: Record<string, string>) => new Headers(value);

  it("uses the address the trusted proxy appended, not what the client sent", () => {
    // The client claims 1.1.1.1; the proxy appends the real peer address.
    expect(trustedClientAddress(headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.20" }), 1)).toBe("198.51.100.20");
    expect(trustedClientAddress(headers({ "x-forwarded-for": "9.9.9.9, 8.8.8.8, 198.51.100.20" }), 1)).toBe("198.51.100.20");
    expect(trustedClientAddress(headers({ "x-forwarded-for": "1.1.1.1, 198.51.100.21, 10.0.0.2" }), 2)).toBe("198.51.100.21");
    expect(trustedClientAddress(headers({ "x-real-ip": "198.51.100.22" }), 1)).toBe("198.51.100.22");
    expect(trustedClientAddress(headers({}), 1)).toBeNull();
  });

  it("uses only the configured header when the edge proxy sets one", () => {
    const sent = headers({ "cf-connecting-ip": "198.51.100.25", "x-forwarded-for": "1.1.1.1" });
    expect(trustedClientAddress(sent, 1, "CF-Connecting-IP")).toBe("198.51.100.25");
    expect(trustedClientAddress(headers({ "x-forwarded-for": "1.1.1.1" }), 1, "CF-Connecting-IP")).toBeNull();
  });

  it("normalizes addresses and groups IPv6 by /64", () => {
    expect(normalizeAddress("::ffff:198.51.100.23")).toBe("198.51.100.23");
    expect(normalizeAddress("198.51.100.24:51234")).toBe("198.51.100.24");
    expect(normalizeAddress("2001:db8:abcd:12::1")).toBe(normalizeAddress("2001:0db8:abcd:0012:ffff:1:2:3"));
    expect(normalizeAddress("2001:db8:abcd:12::1")).toBe("2001:db8:abcd:12::/64");
    expect(normalizeAddress("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    expect(normalizeAddress("not-an-ip")).toBeNull();
  });
});

describe("public prospects", () => {
  it("keeps names, titles and companies, and only flags contact details", () => {
    const record = {
      FULL_NAME_PER: "Asha Rao",
      JOB_TITLE_PER: "VP Marketing",
      COMPANY_NAME_ORG: "Acme",
      EMAIL_ADDRESS_PER: "asha@acme.example",
      LINKEDIN_URL_PER: "https://linkedin.com/in/asha-rao",
      CELLPHONE_PER: "+91 98765 43210",
    };
    const prospect = toPublicProspect(record);
    expect(prospect).toEqual({
      full_name: "Asha Rao",
      job_title: "VP Marketing",
      company_name: "Acme",
      has_email: true,
      has_linkedin: true,
      has_phone: true,
    });
    const text = JSON.stringify(prospect);
    expect(text).not.toContain("acme.example");
    expect(text).not.toContain("asha-rao");
    expect(text).not.toContain("98765");
  });

  it("returns each person once", async () => {
    const row = (id: string, name: string, company: string) => ({ contact_id: id, FULL_NAME_PER: name, COMPANY_NAME_ORG: company });
    const spy = vi.spyOn(searchOrchestrator, "executeSearchFlow").mockResolvedValueOnce({
      records: [row("1", "Julian Posmeck", "Shlau"), row("2", "Julian Posmeck", "Shlau"), row("1", "J. Posmeck", "Shlau"), row("3", "Ana Ruiz", "Acme")],
      total_distinct_count: 4,
      exact_count: true,
      clarification_required: false,
    } as never);
    const outcome = await runPublicProspectSearch("growth people");
    spy.mockRestore();
    expect(outcome.kind === "results" && outcome.prospects.map((p) => p.full_name)).toEqual(["Julian Posmeck", "Ana Ruiz"]);
  });

  it("builds the name from its parts and skips rows without one", () => {
    expect(toPublicProspect({ first_name: "Li", last_name: "Wei", title: "CTO" })).toMatchObject({ full_name: "Li Wei", job_title: "CTO", has_email: false });
    expect(toPublicProspect({ job_title: "CTO" })).toBeNull();
  });
});

describe("/api/public-search", () => {
  const visitor = (address: string, claimed = "1.1.1.1") => ({ "X-Forwarded-For": `${claimed}, ${address}` });
  // The offline mock model writes a people query when the request says "contacts".
  const ask = (address: string, claimed?: string, query = "Find VP of Engineering or CTO contacts in SaaS companies") =>
    callRoute(search, { method: "POST", headers: visitor(address, claimed), body: { query } });

  beforeAll(async () => {
    await seedTestData();
  });

  beforeEach(() => {
    setPublicSearchLimiterForTests(newLimiter());
    resetSingleton("publicSearchOverallLimiter");
  });

  it("returns real rows without contact values, then stops after 3 searches", async () => {
    const first = await ask("198.51.100.30");
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("ok");
    expect(first.body.prospects.length).toBeGreaterThan(0);
    expect(first.body.prospects.length).toBeLessThanOrEqual(10);
    for (const prospect of first.body.prospects) {
      expect(Object.keys(prospect).sort()).toEqual(["company_name", "full_name", "has_email", "has_linkedin", "has_phone", "job_title"]);
    }
    expect(JSON.stringify(first.body)).not.toMatch(/@[a-z0-9-]+\./i);
    expect(first.body.attempts).toMatchObject({ limit: 3, remaining: 2 });

    expect((await ask("198.51.100.30")).body.attempts.remaining).toBe(1);
    expect((await ask("198.51.100.30")).body.attempts.remaining).toBe(0);
    const blocked = await ask("198.51.100.30");
    expect(blocked.status).toBe(429);
    expect(blocked.body.attempts).toMatchObject({ remaining: 0 });
    expect(blocked.body.attempts.resets_at).toEqual(expect.any(String));
  });

  it("can't be reset by refreshing or by forging X-Forwarded-For", async () => {
    for (let i = 0; i < 3; i++) await ask("198.51.100.31", `10.0.0.${i}`);
    // A refresh reads the remaining searches from the database.
    const refreshed = await callRoute(status, { headers: visitor("198.51.100.31") });
    expect(refreshed.body.attempts).toMatchObject({ remaining: 0 });
    // Claiming another address in the header doesn't change the proxy-appended one.
    expect((await ask("198.51.100.31", "203.0.113.200")).status).toBe(429);
  });

  it("doesn't count a search that failed on our side", async () => {
    const spy = vi.spyOn(searchOrchestrator, "executeSearchFlow").mockRejectedValueOnce(new Error("warehouse down"));
    const failed = await ask("198.51.100.32");
    spy.mockRestore();
    expect(failed.status).toBe(503);
    expect(failed.body.attempts).toMatchObject({ remaining: 3 });
  });

  it("asks for a clearer request in plain words, without counting it", async () => {
    const spy = vi.spyOn(searchOrchestrator, "executeSearchFlow").mockResolvedValueOnce({
      records: [],
      clarification_required: true,
      clarification_message: "Pick EMPLOYEE_COUNT_RANGE_ORG values",
    } as never);
    const res = await ask("198.51.100.35");
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("clarify");
    expect(res.body.message).not.toContain("EMPLOYEE_COUNT_RANGE_ORG");
    expect(res.body.attempts).toMatchObject({ remaining: 3 });
  });

  it("validates the request before counting it", async () => {
    expect((await ask("198.51.100.33", undefined, "x")).status).toBe(422);
    expect((await callRoute(status, { headers: visitor("198.51.100.33") })).body.attempts.remaining).toBe(3);
  });

  it("is unavailable, not unlimited, without the database", async () => {
    setPublicSearchLimiterForTests(null);
    expect((await ask("198.51.100.34")).status).toBe(503);
    expect((await callRoute(status, { headers: visitor("198.51.100.34") })).status).toBe(503);
  });
});
