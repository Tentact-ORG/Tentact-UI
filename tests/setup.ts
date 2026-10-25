import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

// Isolated, offline configuration: mock LLM agents, mock ClickHouse, throwaway SQLite database.
const runDir = path.join(os.tmpdir(), `leadgen-test-${process.pid}-${randomBytes(4).toString("hex")}`);

Object.assign(process.env, {
  APP_ENV: "test",
  LOG_LEVEL: "CRITICAL",
  DATABASE_URL: `sqlite+aiosqlite:///${path.join(runDir, "app.db")}`,
  LLM_PROVIDER: "mock",
  LLM_MODEL: "mock-advanced-sql",
  CLICKHOUSE_MODE: "mock",
  CLICKHOUSE_DATABASE: "leadgen_warehouse",
  JWT_SECRET_KEY: "test_secret_key_with_at_least_32_characters!!",
  EXPORT_STORAGE_PATH: path.join(runDir, "exports"),
  EXPORT_MAX_ROWS: "100000",
});

await import("node:fs").then((fs) => fs.promises.mkdir(runDir, { recursive: true }));
