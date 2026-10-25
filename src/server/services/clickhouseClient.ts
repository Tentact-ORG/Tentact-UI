import fs from "node:fs";
import https from "node:https";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { getSettings } from "../core/config";
import { resolveFromCwd } from "../core/paths";
import { singleton } from "../core/singleton";

export interface QueryResult {
  columns: string[];
  /** ClickHouse type of each column (empty strings in mock mode). */
  types: string[];
  rows: unknown[][];
}

interface MockDataset {
  companies: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  unapproved_events: Record<string, unknown>[];
}

const INT64_TYPE = /^(?:Nullable\()?(?:LowCardinality\()?(?:Nullable\()?U?Int(?:64|128|256)\b/;

/** 64-bit integers arrive JSON-quoted; return them as numbers when that is lossless. */
function normalizeValue(value: unknown, type: string): unknown {
  if (typeof value === "string" && INT64_TYPE.test(type)) {
    const asNumber = Number(value);
    if (Number.isSafeInteger(asNumber)) return asNumber;
  }
  return value;
}

class ClickHouseService {
  private client: ClickHouseClient | null = null;
  private mockData: MockDataset | null = null;

  private getClient(): ClickHouseClient {
    if (this.client === null) {
      const s = getSettings();
      const protocol = s.CLICKHOUSE_SECURE ? "https" : "http";
      this.client = createClient({
        url: `${protocol}://${s.CLICKHOUSE_HOST}:${s.CLICKHOUSE_PORT}`,
        username: s.CLICKHOUSE_USER,
        password: s.CLICKHOUSE_PASSWORD,
        database: s.CLICKHOUSE_DATABASE,
        // Per-query deadlines are enforced server-side (max_execution_time) and with abort
        // signals; this is only the socket-level ceiling.
        request_timeout: 60_000,
        compression: { request: false, response: false },
        ...(s.CLICKHOUSE_SECURE && !s.CLICKHOUSE_VERIFY
          ? { http_agent: new https.Agent({ keepAlive: true, rejectUnauthorized: false }), set_basic_auth_header: true }
          : {}),
      });
    }
    return this.client;
  }

  async isConnected(): Promise<boolean> {
    const s = getSettings();
    if (s.CLICKHOUSE_MODE === "mock") return true;
    try {
      const result = await this.getClient().ping({
        select: false,
        abort_signal: AbortSignal.timeout(s.CLICKHOUSE_CONNECT_TIMEOUT_SEC * 1000),
      });
      return result.success;
    } catch {
      return false;
    }
  }

  /** Executes a read-only ClickHouse query and returns column names, types and rows. */
  async executeQuery(query: string, parameters?: Record<string, unknown> | null, timeoutSec?: number): Promise<QueryResult> {
    const s = getSettings();
    if (s.CLICKHOUSE_MODE === "mock") {
      return this.executeMock(query);
    }
    const timeout = timeoutSec ?? s.CLICKHOUSE_QUERY_TIMEOUT_SEC;
    const resultSet = await this.getClient().query({
      query,
      format: "JSONCompactEachRowWithNamesAndTypes",
      query_params: parameters ?? undefined,
      clickhouse_settings: {
        max_execution_time: timeout,
        readonly: "1", // Database-side read-only enforcement
      },
      abort_signal: AbortSignal.timeout((timeout + 5) * 1000),
    });
    const raw = (await resultSet.json()) as unknown[][];
    const columns = (raw[0] ?? []) as string[];
    const types = (raw[1] ?? []) as string[];
    const rows = raw.slice(2).map((row) => row.map((value, i) => normalizeValue(value, types[i] ?? "")));
    return { columns, types, rows };
  }

  private loadMockData(): MockDataset {
    if (this.mockData === null) {
      const seedPath = resolveFromCwd("database", "synthetic_seed_data.json");
      this.mockData = fs.existsSync(seedPath)
        ? (JSON.parse(fs.readFileSync(seedPath, "utf-8")) as MockDataset)
        : { companies: [], contacts: [], unapproved_events: [] };
    }
    return this.mockData;
  }

  /** Mock execution engine backed by the local synthetic JSON dataset. */
  private executeMock(query: string): QueryResult {
    const data = this.loadMockData();
    const q = query.toLowerCase();
    const db = getSettings().CLICKHOUSE_DATABASE;
    const untyped = (columns: string[], rows: unknown[][]): QueryResult => ({
      columns,
      types: columns.map(() => ""),
      rows,
    });

    if (q.includes("from system.tables")) {
      return untyped(
        ["database", "name", "engine"],
        [
          [db, "synthetic_companies", "MergeTree"],
          [db, "synthetic_contacts", "MergeTree"],
          [db, "synthetic_raw_events", "MergeTree"],
        ],
      );
    }
    if (q.includes("from system.columns")) {
      // Same column order as the discovery query selects: table, name, type, is_in_primary_key, is_nullable
      const cols: [string, string, string, number, number][] = [
        ["synthetic_companies", "company_id", "UInt64", 1, 0],
        ["synthetic_companies", "name", "String", 0, 0],
        ["synthetic_companies", "domain", "String", 0, 0],
        ["synthetic_companies", "industry", "LowCardinality(String)", 0, 0],
        ["synthetic_companies", "country", "LowCardinality(String)", 0, 0],
        ["synthetic_companies", "city", "String", 0, 0],
        ["synthetic_companies", "employee_count", "UInt32", 0, 0],
        ["synthetic_companies", "annual_revenue_usd", "Float64", 0, 0],
        ["synthetic_companies", "technologies", "Array(String)", 0, 0],
        ["synthetic_companies", "funding_stage", "LowCardinality(Nullable(String))", 0, 1],
        ["synthetic_companies", "founded_year", "UInt16", 0, 0],
        ["synthetic_companies", "confidential_arr", "Nullable(Float64)", 0, 1],
        ["synthetic_companies", "created_at", "DateTime", 0, 0],
        ["synthetic_contacts", "contact_id", "UInt64", 1, 0],
        ["synthetic_contacts", "company_id", "UInt64", 0, 0],
        ["synthetic_contacts", "first_name", "String", 0, 0],
        ["synthetic_contacts", "last_name", "String", 0, 0],
        ["synthetic_contacts", "full_name", "String", 0, 0],
        ["synthetic_contacts", "job_title", "String", 0, 0],
        ["synthetic_contacts", "seniority_level", "LowCardinality(String)", 0, 0],
        ["synthetic_contacts", "department", "LowCardinality(String)", 0, 0],
        ["synthetic_contacts", "work_email", "String", 0, 0],
        ["synthetic_contacts", "direct_phone", "Nullable(String)", 0, 1],
        ["synthetic_contacts", "country", "LowCardinality(String)", 0, 0],
        ["synthetic_contacts", "linkedin_url", "Nullable(String)", 0, 1],
        ["synthetic_contacts", "is_verified", "UInt8", 0, 0],
        ["synthetic_contacts", "created_at", "DateTime", 0, 0],
        ["synthetic_raw_events", "event_id", "UInt64", 1, 0],
        ["synthetic_raw_events", "company_id", "UInt64", 0, 0],
        ["synthetic_raw_events", "event_type", "String", 0, 0],
        ["synthetic_raw_events", "raw_payload", "String", 0, 0],
        ["synthetic_raw_events", "event_time", "DateTime", 0, 0],
      ];
      return untyped(["table", "name", "type", "is_in_primary_key", "is_nullable"], cols);
    }

    if (q.includes("count(")) {
      const total = q.includes("synthetic_contacts") ? data.contacts.length : data.companies.length;
      return untyped(["count"], [[total]]);
    }

    const sample = (q.includes("synthetic_contacts") ? data.contacts : data.companies).slice(0, 25);
    const keys = sample.length > 0 ? Object.keys(sample[0]) : [];
    return untyped(
      keys,
      sample.map((record) => keys.map((k) => record[k] ?? null)),
    );
  }

  async close(): Promise<void> {
    if (this.client !== null) {
      await this.client.close();
      this.client = null;
    }
  }
}

export const chService = singleton("clickhouse", () => new ClickHouseService());
