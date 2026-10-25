import { beforeEach, describe, expect, it } from "vitest";
import { analyzeSql } from "@/server/services/clickhouseSql";
import { sqlValidator } from "@/server/services/sqlValidator";
import { seedTestData } from "./helpers";

const DB = "leadgen_warehouse";

describe("deterministic SQL validator", () => {
  beforeEach(async () => {
    await seedTestData();
  });

  it("permits a valid read-only query", () => {
    const sql = `
      SELECT c.company_id, c.name, c.country
      FROM ${DB}.synthetic_companies AS c
      WHERE c.country = 'United States'
      ORDER BY c.company_id ASC
      LIMIT 25 OFFSET 0`;
    const { valid, violations } = sqlValidator.validateSql(sql, "MEMBER");
    expect(violations).toEqual([]);
    expect(valid).toBe(true);
  });

  it("rejects mutations", () => {
    for (const q of [
      `DROP TABLE ${DB}.synthetic_companies`,
      `INSERT INTO ${DB}.synthetic_companies (company_id) VALUES (1)`,
      `DELETE FROM ${DB}.synthetic_companies WHERE company_id = 1`,
      `ALTER TABLE ${DB}.synthetic_companies DROP COLUMN name`,
    ]) {
      const { valid, violations } = sqlValidator.validateSql(q, "ADMIN");
      expect(valid).toBe(false);
      expect(violations.some((v) => v.includes("Forbidden") || v.toLowerCase().includes("syntax"))).toBe(true);
    }
  });

  it("rejects multi-statement payloads", () => {
    const sql = `SELECT company_id FROM ${DB}.synthetic_companies LIMIT 10;\nDROP TABLE ${DB}.synthetic_companies;`;
    const { valid, violations } = sqlValidator.validateSql(sql, "ADMIN");
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("Multi-statement"))).toBe(true);
  });

  it("rejects system catalog access", () => {
    const { valid, violations } = sqlValidator.validateSql("SELECT * FROM system.tables LIMIT 10", "ADMIN");
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("system catalog") || v.toLowerCase().includes("forbidden"))).toBe(true);
  });

  it("rejects unapproved tables", () => {
    const { valid, violations } = sqlValidator.validateSql(`SELECT event_id FROM ${DB}.synthetic_raw_events LIMIT 10`, "ADMIN");
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("not approved"))).toBe(true);
  });

  it("rejects restricted columns for members but permits admins", () => {
    const sql = `SELECT c.company_id, c.confidential_arr FROM ${DB}.synthetic_companies AS c LIMIT 25`;
    const member = sqlValidator.validateSql(sql, "MEMBER");
    expect(member.valid).toBe(false);
    expect(member.violations.some((v) => v.includes("RESTRICTED"))).toBe(true);
    expect(sqlValidator.validateSql(sql, "ADMIN").valid).toBe(true);
  });

  it("rejects dangerous functions", () => {
    const sql = `SELECT c.company_id, file('path/to/secret') FROM ${DB}.synthetic_companies AS c LIMIT 25`;
    const { valid, violations } = sqlValidator.validateSql(sql, "ADMIN");
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("Forbidden function"))).toBe(true);
  });

  it("rejects table functions used as a data source", () => {
    const { valid, violations } = sqlValidator.validateSql("SELECT * FROM url('http://evil.example/x', CSV) LIMIT 5", "ADMIN");
    expect(valid).toBe(false);
    expect(violations.some((v) => v.includes("Forbidden function call 'url'"))).toBe(true);
  });

  it("checks every column a wildcard selects", () => {
    const sql = `SELECT * FROM ${DB}.synthetic_companies LIMIT 5`;
    expect(sqlValidator.validateSql(sql, "MEMBER").violations.some((v) => v.includes("confidential_arr"))).toBe(true);
    expect(sqlValidator.validateSql(sql, "ADMIN").valid).toBe(true);
    // count(*) is not a column wildcard
    expect(sqlValidator.validateSql(`SELECT count(*) FROM ${DB}.synthetic_companies LIMIT 1`, "MEMBER").valid).toBe(true);
  });

  it("allows the approved contacts->companies join but not unapproved joins", () => {
    const approved = `
      SELECT ct.contact_id, c.name AS company_name FROM ${DB}.synthetic_contacts AS ct
      INNER JOIN ${DB}.synthetic_companies AS c ON ct.company_id = c.company_id LIMIT 25`;
    expect(sqlValidator.validateSql(approved, "MEMBER").valid).toBe(true);

    const commaJoin = `SELECT c.name FROM ${DB}.synthetic_companies AS c, ${DB}.synthetic_raw_events AS e LIMIT 5`;
    const result = sqlValidator.validateSql(commaJoin, "ADMIN");
    expect(result.violations.some((v) => v.includes("Unapproved table join"))).toBe(true);
  });

  it("enforces interactive LIMIT caps but not for exports", () => {
    const noLimit = `SELECT c.name FROM ${DB}.synthetic_companies AS c`;
    expect(sqlValidator.validateSql(noLimit, "MEMBER").violations[0]).toContain("must specify a LIMIT");
    expect(sqlValidator.validateSql(noLimit, "MEMBER", true).valid).toBe(true);
    const tooMany = `SELECT c.name FROM ${DB}.synthetic_companies AS c LIMIT 500`;
    expect(sqlValidator.validateSql(tooMany, "MEMBER", false, 100).violations[0]).toContain("exceeds maximum permitted (100)");
    // "LIMIT offset, count" form and LIMIT BY
    expect(sqlValidator.validateSql(`SELECT c.name FROM ${DB}.synthetic_companies AS c LIMIT 0, 50`, "MEMBER", false, 100).valid).toBe(
      true,
    );
    expect(
      sqlValidator.validateSql(`SELECT c.name FROM ${DB}.synthetic_companies AS c LIMIT 1 BY c.industry LIMIT 20`, "MEMBER").valid,
    ).toBe(true);
  });

  it("reports syntax errors and empty input", () => {
    expect(sqlValidator.validateSql("   ", "ADMIN").violations).toEqual(["Query is empty."]);
    expect(sqlValidator.validateSql("SELECT 'unterminated FROM t", "ADMIN").violations[0]).toMatch(/^SQL syntax error/);
    expect(sqlValidator.validateSql("SELECT (1 FROM t LIMIT 1", "ADMIN").violations[0]).toMatch(/^SQL syntax error/);
  });
});

describe("ClickHouse SQL analyzer", () => {
  it("does not split on semicolons or keywords inside strings and comments", () => {
    const analysis = analyzeSql("SELECT 'a; DROP TABLE x' AS s FROM t /* ; DELETE */ -- ; INSERT\nLIMIT 1");
    expect(analysis.statementCount).toBe(1);
    expect(analysis.mutationKeywords).toEqual([]);
  });

  it("understands ClickHouse constructs", () => {
    const analysis = analyzeSql(`
      WITH recent AS (SELECT company_id FROM db.companies WHERE created_at > now() - INTERVAL 30 DAY)
      SELECT c.name, tag, toYear(c.created_at) AS yr, extract(YEAR FROM c.created_at)
      FROM db.companies AS c FINAL
      ARRAY JOIN c.technologies AS tag
      WHERE c.company_id IN (SELECT company_id FROM recent)
        AND has(c.technologies, {tech:String})
        AND arrayExists(x -> ilike(x, '%ai%'), c.technologies)
      LIMIT 10`);
    expect(analysis.statementKeyword).toBe("WITH");
    expect([...analysis.cteNames]).toEqual(["recent"]);
    expect(analysis.tables.map((t) => `${t.db}.${t.name}`)).toEqual(["db.companies", "db.companies", "null.recent"]);
    expect(analysis.hasJoin).toBe(false); // ARRAY JOIN is not a table join
    expect(analysis.columns).toContainEqual({ qualifier: "c", name: "technologies" });
    expect(analysis.columns.some((c) => c.name === "DAY" || c.name === "yr")).toBe(false);
    expect(analysis.functions).toEqual(expect.arrayContaining(["toYear", "extract", "has", "arrayExists", "ilike"]));
    expect(analysis.limit).toEqual({ present: true, value: 10 });
  });
});
