import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { getSettings } from "@/server/core/config";
import { closeDb, getCodec, getDialect, migrateDatabase, parseDatabaseUrl, pendingSchemaChanges } from "@/server/core/database";

describe("application database compatibility", () => {
  it("parses SQLAlchemy-style and plain database URLs", () => {
    expect(parseDatabaseUrl("sqlite+aiosqlite:///./leadgen_app.db")).toEqual({
      dialect: "sqlite",
      target: `${process.cwd()}/leadgen_app.db`,
    });
    expect(parseDatabaseUrl("sqlite:////var/data/app.db").target).toBe("/var/data/app.db");
    expect(parseDatabaseUrl("sqlite+aiosqlite:///:memory:").target).toBe(":memory:");
    expect(parseDatabaseUrl("postgresql+asyncpg://u:p@db:5432/leadgen_app")).toEqual({
      dialect: "postgres",
      target: "postgresql://u:p@db:5432/leadgen_app",
    });
    expect(() => parseDatabaseUrl("mysql://x")).toThrow(/Unsupported DATABASE_URL/);
  });

  it("reads and writes timestamps in SQLAlchemy's SQLite format", () => {
    expect(getDialect()).toBe("sqlite");
    const codec = getCodec();
    const date = new Date("2026-10-18T11:22:29.534Z");
    expect(codec.date(date)).toBe("2026-10-18 11:22:29.534000");
    // Values written by the Python service (naive UTC, microseconds).
    expect(codec.readDate("2026-10-18 11:22:29.534839").toISOString()).toBe("2026-10-18T11:22:29.534Z");
    expect(codec.readDate("2026-10-21 16:00:20.516945+00:00").toISOString()).toBe("2026-10-21T16:00:20.516Z");
    expect(codec.readDate("2026-10-18 11:22:29").toISOString()).toBe("2026-10-18T11:22:29.000Z");
    expect(codec.readNullableDate(null)).toBeNull();
  });

  it("encodes booleans and JSON like SQLAlchemy", () => {
    const codec = getCodec();
    expect(codec.bool(true)).toBe(1);
    expect(codec.readBool(0)).toBe(false);
    expect(codec.json(["select", "filter"])).toBe('["select","filter"]');
    expect(codec.readJson('["select", "filter", "sort", "group"]')).toEqual(["select", "filter", "sort", "group"]);
  });
});

describe("first start on an existing database", () => {
  it("backs up an older SQLite database before adding tables and columns", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leadgen-migrate-"));
    const file = path.join(dir, "legacy.db");
    // The Python service's schema, before lists, credits, lockouts and saved_searches.ui_state.
    const legacy = new BetterSqlite3(file);
    legacy.exec(`CREATE TABLE organizations (id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(100) NOT NULL, created_at DATETIME NOT NULL);
      CREATE TABLE saved_searches (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, user_id INTEGER NOT NULL, name VARCHAR(255) NOT NULL,
        natural_query TEXT, structured_filters JSON, search_target VARCHAR(20) NOT NULL, created_at DATETIME NOT NULL);
      INSERT INTO organizations VALUES (1, 'Acme', 'acme', '2025-01-01 00:00:00.000000');`);
    legacy.close();

    const settings = getSettings();
    const original = settings.DATABASE_URL;
    try {
      await closeDb();
      Object.assign(settings, { DATABASE_URL: `sqlite:///${file}` });
      expect(await pendingSchemaChanges()).toEqual(expect.arrayContaining(["table users", "table login_lockouts", "column saved_searches.ui_state"]));
      await migrateDatabase();
      expect(await pendingSchemaChanges()).toEqual([]);
      await migrateDatabase(); // an up-to-date database is not copied again

      const backups = fs.readdirSync(dir).filter((name) => name.startsWith("legacy.db.backup-"));
      expect(backups).toHaveLength(1);
      const copy = new BetterSqlite3(path.join(dir, backups[0]), { readonly: true });
      expect(copy.prepare("SELECT name FROM organizations").get()).toEqual({ name: "Acme" });
      expect(copy.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'users'").get()).toEqual({ n: 0 });
      copy.close();
    } finally {
      await closeDb();
      Object.assign(settings, { DATABASE_URL: original });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
