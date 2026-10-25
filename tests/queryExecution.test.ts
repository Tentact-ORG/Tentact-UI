import { beforeEach, describe, expect, it, vi } from "vitest";
import { chService } from "@/server/services/clickhouseClient";
import { queryExecutor, sanitizeClickhouseSql } from "@/server/services/queryExecutor";
import { seedTestData } from "./helpers";

const DB = "leadgen_warehouse";

describe("query execution & distinct counts", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await seedTestData();
  });

  it("returns exact distinct company counts not inflated by contacts", async () => {
    const res = await queryExecutor.executeSearchQuery(
      `SELECT c.company_id, c.name, c.industry FROM ${DB}.synthetic_companies AS c
       WHERE c.industry = 'SaaS' ORDER BY c.company_id ASC LIMIT 10 OFFSET 0`,
      `SELECT count(DISTINCT c.company_id) FROM ${DB}.synthetic_companies AS c
       INNER JOIN ${DB}.synthetic_contacts AS ct ON c.company_id = ct.company_id WHERE c.industry = 'SaaS'`,
    );
    expect(res.exact_count).toBe(true);
    expect(res.total_count).toBeGreaterThan(0);
    expect(res.records.length).toBeGreaterThan(0);
  });

  it("returns distinct contact counts", async () => {
    const res = await queryExecutor.executeSearchQuery(
      `SELECT ct.contact_id, ct.full_name, ct.job_title, ct.work_email FROM ${DB}.synthetic_contacts AS ct
       WHERE ct.country = 'United States' ORDER BY ct.contact_id ASC LIMIT 25 OFFSET 0`,
      `SELECT count(DISTINCT ct.contact_id) FROM ${DB}.synthetic_contacts AS ct WHERE ct.country = 'United States'`,
    );
    expect(res.exact_count).toBe(true);
    expect(res.total_count).toBeGreaterThan(0);
    expect(res.records.length).toBeLessThanOrEqual(25);
    expect(res.records[0]).toHaveProperty("contact_id");
  });

  it("falls back to the page size when the count query fails", async () => {
    vi.spyOn(chService, "executeQuery").mockImplementation(async (query) => {
      if (query.includes("count(")) throw new Error("timeout");
      return { columns: ["id", "seen_at"], types: ["UInt64", "DateTime"], rows: [[1, "2024-09-21 12:00:00"], [2, null]] };
    });
    const res = await queryExecutor.executeSearchQuery("SELECT id, seen_at FROM t LIMIT 5", "SELECT count() FROM t");
    expect(res).toMatchObject({ total_count: 2, exact_count: false });
    expect(res.records).toEqual([
      { id: 1, seen_at: "2024-09-21T12:00:00" },
      { id: 2, seen_at: null },
    ]);
  });

  it("sanitizes known LLM SQL quirks", () => {
    expect(sanitizeClickhouseSql("SELECT toInt32(splitBy(',', x)[1]) FROM new_company_data_10_26")).toBe(
      "SELECT toInt32OrZero(splitByChar(',', x)[1]) FROM new_company_data",
    );
    expect(sanitizeClickhouseSql("SELECT toInt32OrNull(x)")).toBe("SELECT toInt32OrNull(x)");
    expect(sanitizeClickhouseSql(null)).toBeNull();
  });
});
