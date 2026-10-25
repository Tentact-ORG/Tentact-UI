import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/core/database";
import { chService } from "@/server/services/clickhouseClient";
import { relationshipService } from "@/server/services/relationshipDiscovery";
import { classifySensitivity, computeSchemaFingerprint, schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";
import { seedTestData } from "./helpers";

describe("schema, relationship and value discovery", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await seedTestData();
  });

  it("discovers tables and columns", async () => {
    const res = await schemaDiscoveryService.discoverClickhouseSchema();
    expect(res.tables_count).toBeGreaterThanOrEqual(2);
    expect(res.columns_count).toBeGreaterThanOrEqual(20);
    expect(res.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(res.schema_changed).toBe(false);

    const cache = schemaDiscoveryService.getCachedSchema();
    expect(cache.synthetic_companies.columns).toHaveProperty("company_id");
    expect(cache.synthetic_companies.columns).toHaveProperty("industry");
    expect(cache.synthetic_contacts).toBeDefined();
    expect(cache.synthetic_companies.columns.company_id.is_primary_key).toBe(true);
    expect(cache.synthetic_companies.columns.confidential_arr.sensitivity).toBe("restricted");
    expect(cache.synthetic_raw_events.is_approved).toBe(false);
  });

  it("computes fingerprints identical to the Python implementation", () => {
    // Reference value computed with hashlib in the Python service.
    expect(
      computeSchemaFingerprint([
        ["synthetic_companies", "company_id", "UInt64", true, false],
        ["synthetic_companies", "funding_stage", "LowCardinality(Nullable(String))", false, true],
      ]),
    ).toBe("bde8f832953cce55ee90c30e9a5e9c101e62b6be4d03ed55da90febffd1199c2");
  });

  it("detects schema drift and invalidates affected relationships", async () => {
    const original = chService.executeQuery.bind(chService);
    vi.spyOn(chService, "executeQuery").mockImplementation(async (query, params, timeout) => {
      const result = await original(query, params, timeout);
      if (query.includes("system.columns")) {
        return { ...result, rows: result.rows.filter((r) => !(r[0] === "synthetic_contacts" && r[1] === "company_id")) };
      }
      return result;
    });

    const res = await schemaDiscoveryService.discoverClickhouseSchema();
    expect(res.schema_changed).toBe(true);
    const statuses = await getDb()
      .selectFrom("table_relationships")
      .select(["source_table", "status", "evidence"])
      .where("source_table", "=", "synthetic_contacts")
      .execute();
    expect(statuses.every((r) => r.status === "INVALIDATED" && r.evidence.includes("[INVALIDATED:"))).toBe(true);
    const fingerprints = await getDb().selectFrom("schema_fingerprints").select("status").execute();
    expect(fingerprints.map((f) => f.status).sort()).toEqual(["active", "superseded"]);
  });

  it("infers and auto-approves the contacts -> companies relationship", () => {
    const rels = relationshipService.getApprovedRelationships();
    expect(rels.length).toBeGreaterThanOrEqual(1);
    expect(rels.some((r) => r.source_table === "synthetic_contacts" && r.target_table === "synthetic_companies")).toBe(true);
    expect(relationshipService.isJoinApproved("synthetic_companies", "synthetic_contacts")).toBe(true);
    expect(relationshipService.isJoinApproved("synthetic_companies", "synthetic_raw_events")).toBe(false);
    expect(relationshipService.isJoinApproved("synthetic_contacts", "synthetic_companies", ["company_id", "company_id"])).toBe(true);
    expect(relationshipService.isJoinApproved("synthetic_contacts", "synthetic_companies", ["contact_id", "company_id"])).toBe(false);
  });

  it("selects value discovery strategies", async () => {
    const industry = await valueDiscoveryService.discoverValuesForColumn("synthetic_companies", "industry", "LowCardinality(String)");
    expect(industry.strategy).toBe("categorical_enum");
    expect(["complete", "partial"]).toContain(industry.completeness);
    expect((industry.cached_values as unknown[]).length).toBeGreaterThan(0);

    const tech = await valueDiscoveryService.discoverValuesForColumn("synthetic_companies", "technologies", "Array(String)");
    expect(tech.strategy).toBe("array_enum");
    expect((tech.cached_values as unknown[]).length).toBeGreaterThan(0);

    const email = await valueDiscoveryService.discoverValuesForColumn("synthetic_contacts", "work_email", "String");
    expect(email.strategy).toBe("unbounded_pii_skip");
    expect(email.completeness).toBe("deferred");

    expect(valueDiscoveryService.determineStrategy("job_title", "String")).toBe("bounded_search");
    expect(valueDiscoveryService.determineStrategy("created_at", "DateTime")).toBe("deferred");
  });

  it("computes numeric ranges", async () => {
    vi.spyOn(chService, "executeQuery").mockResolvedValue({ columns: ["min", "max", "count"], types: [], rows: [[10, 44529, "250"]] });
    const emp = await valueDiscoveryService.discoverValuesForColumn("synthetic_companies", "employee_count", "UInt32");
    expect(emp).toEqual({
      strategy: "numeric_range",
      completeness: "complete",
      cached_values: { min: 10, max: 44529 },
      exact_count: 250,
      is_exact: true,
    });
  });

  it("marks failed discoveries without throwing", async () => {
    vi.spyOn(chService, "executeQuery").mockRejectedValue(new Error("timeout"));
    const res = await valueDiscoveryService.discoverValuesForColumn("synthetic_companies", "industry", "LowCardinality(String)");
    expect(res.completeness).toBe("failed");
  });

  it("refreshes, persists and normalizes cached values", async () => {
    const count = await valueDiscoveryService.refreshAllValues();
    expect(count).toBeGreaterThanOrEqual(30);
    expect(valueDiscoveryService.isReady).toBe(true);
    const stored = await getDb().selectFrom("discovered_values").select("id").execute();
    expect(stored.length).toBe(count);
    // Mock categorical values are derived from the sample rows; normalization is case-insensitive.
    const first = (valueDiscoveryService.getCachedValues()["synthetic_companies.industry"].values as string[])[0];
    expect(valueDiscoveryService.normalizeValue("synthetic_companies.industry", ` ${first.toUpperCase()} `)).toBe(first);
    expect(valueDiscoveryService.normalizeValue("synthetic_companies.unknown", "x")).toBeNull();
  });

  it("classifies column sensitivity", () => {
    expect(classifySensitivity("confidential_arr")).toBe("restricted");
    expect(classifySensitivity("direct_phone")).toBe("restricted");
    expect(classifySensitivity("raw_payload")).toBe("internal");
    expect(classifySensitivity("industry")).toBe("public");
  });
});
