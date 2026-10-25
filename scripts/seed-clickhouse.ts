/**
 * ClickHouse Seed Script.
 * Creates the leadgen_warehouse database and tables from database/clickhouse_synthetic_seed.sql
 * and loads the synthetic dataset from database/synthetic_seed_data.json.
 *
 * Usage: npm run seed-clickhouse   (connection settings come from CLICKHOUSE_* variables)
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { createClient } from "@clickhouse/client";
import { getSettings } from "@/server/core/config";
import { errorMessage } from "@/server/core/errors";

interface SeedDataset {
  companies: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  unapproved_events: Record<string, unknown>[];
}

async function seedDatabase(): Promise<void> {
  const s = getSettings();
  const protocol = s.CLICKHOUSE_SECURE ? "https" : "http";
  console.log(`Connecting to ClickHouse at ${s.CLICKHOUSE_HOST}:${s.CLICKHOUSE_PORT}...`);
  // A writable connection (the application itself only ever queries with readonly=1).
  const client = createClient({
    url: `${protocol}://${s.CLICKHOUSE_HOST}:${s.CLICKHOUSE_PORT}`,
    username: s.CLICKHOUSE_USER,
    password: s.CLICKHOUSE_PASSWORD,
    request_timeout: 60_000,
    ...(s.CLICKHOUSE_SECURE && !s.CLICKHOUSE_VERIFY ? { http_agent: new https.Agent({ rejectUnauthorized: false }), set_basic_auth_header: true } : {}),
  });

  try {
    const root = path.resolve(process.cwd(), "database");
    const ddl = fs.readFileSync(path.join(root, "clickhouse_synthetic_seed.sql"), "utf-8");
    for (const statement of ddl.split(";").map((part) => part.trim()).filter(Boolean)) {
      console.log(`Executing DDL: ${statement.replace(/\s+/g, " ").slice(0, 60)}...`);
      await client.command({ query: statement });
    }

    const data = JSON.parse(fs.readFileSync(path.join(root, "synthetic_seed_data.json"), "utf-8")) as SeedDataset;
    const tables: Array<[string, Record<string, unknown>[], string]> = [
      ["leadgen_warehouse.synthetic_companies", data.companies, "companies"],
      ["leadgen_warehouse.synthetic_contacts", data.contacts, "contacts"],
      ["leadgen_warehouse.synthetic_raw_events", data.unapproved_events, "raw events"],
    ];
    for (const [table, rows, label] of tables) {
      console.log(`Inserting ${rows.length} ${label}...`);
      await client.command({ query: `TRUNCATE TABLE IF EXISTS ${table}` });
      await client.insert({ table, values: rows, format: "JSONEachRow" });
    }

    const counts: string[] = [];
    for (const [table, , label] of tables) {
      const rs = await client.query({ query: `SELECT count() AS c FROM ${table}`, format: "JSONEachRow" });
      const [{ c }] = (await rs.json()) as Array<{ c: string }>;
      counts.push(`${c} ${label}`);
    }
    console.log(`Verification successful: ${counts.join(", ")} in ClickHouse.`);
  } finally {
    await client.close();
  }
}

seedDatabase().catch((err) => {
  console.error(`ERROR: ClickHouse seeding failed: ${errorMessage(err)}`);
  process.exit(1);
});
