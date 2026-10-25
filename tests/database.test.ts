import { describe, expect, it } from "vitest";
import { getCodec, getDialect, parseDatabaseUrl } from "@/server/core/database";

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
