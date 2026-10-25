import { getSettings } from "../core/config";
import { getCodec, getDb } from "../core/database";
import { errorMessage } from "../core/errors";
import { getLogger } from "../core/logger";
import { singleton } from "../core/singleton";
import { ValueCompleteness, toDiscoveredValue } from "../models/entities";
import { chService } from "./clickhouseClient";
import { schemaDiscoveryService } from "./schemaDiscovery";

const logger = getLogger("leadgen.value_discovery");

const MAX_DISTINCT_VALUES = 500;

export type DiscoveryStrategy =
  | "unbounded_pii_skip"
  | "array_enum"
  | "numeric_range"
  | "categorical_enum"
  | "bounded_search"
  | "deferred";

export interface ValueDiscoveryResult {
  strategy: string;
  completeness: ValueCompleteness;
  cached_values: unknown;
  exact_count: number;
  is_exact: boolean;
}

export interface CachedValueEntry {
  table: string;
  column: string;
  strategy: string;
  completeness: string;
  values: unknown;
  exact_count: number;
  is_exact: boolean;
}

/** Backtick-quotes a ClickHouse identifier discovered from the system catalog. */
export function quoteIdentifier(name: string): string {
  return `\`${name.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

function deferredResult(strategy: string): ValueDiscoveryResult {
  return { strategy, completeness: ValueCompleteness.DEFERRED, cached_values: [], exact_count: 0, is_exact: false };
}

function enumResult(strategy: string, values: unknown[]): ValueDiscoveryResult {
  if (values.length > MAX_DISTINCT_VALUES) {
    return {
      strategy,
      completeness: ValueCompleteness.PARTIAL,
      cached_values: values.slice(0, MAX_DISTINCT_VALUES),
      exact_count: MAX_DISTINCT_VALUES,
      is_exact: false,
    };
  }
  return {
    strategy,
    completeness: ValueCompleteness.COMPLETE,
    cached_values: values.map((v) => String(v)).sort(),
    exact_count: values.length,
    is_exact: true,
  };
}

class ValueDiscoveryService {
  private valueCache: Record<string, CachedValueEntry> = {};
  private ready = false;

  get isReady(): boolean {
    return this.ready;
  }

  determineStrategy(columnName: string, dataType: string): DiscoveryStrategy {
    const col = columnName.toLowerCase();
    const typ = dataType.toLowerCase();

    // PII / high-cardinality identifiers are never enumerated.
    if (["email", "phone", "domain", "url", "id", "name", "first_name", "last_name", "full_name"].some((t) => col.includes(t))) {
      return "unbounded_pii_skip";
    }
    if (typ.includes("array")) return "array_enum";
    if (["int", "float", "decimal"].some((t) => typ.includes(t))) {
      if (["year", "count", "revenue", "arr"].some((t) => col.includes(t))) return "numeric_range";
    }
    if (
      typ.includes("lowcardinality") ||
      ["industry", "country", "city", "department", "seniority_level", "funding_stage", "status"].includes(col)
    ) {
      return "categorical_enum";
    }
    if (["job_title", "title", "role"].includes(col)) return "bounded_search";
    return "deferred";
  }

  /** Discovers distinct values or ranges for one column using bounded queries. */
  async discoverValuesForColumn(tableName: string, columnName: string, dataType: string): Promise<ValueDiscoveryResult> {
    const strategy = this.determineStrategy(columnName, dataType);
    if (strategy === "unbounded_pii_skip") return deferredResult(strategy);

    const table = `${quoteIdentifier(getSettings().CLICKHOUSE_DATABASE)}.${quoteIdentifier(tableName)}`;
    const col = quoteIdentifier(columnName);
    try {
      if (strategy === "categorical_enum") {
        const { rows } = await chService.executeQuery(
          `SELECT DISTINCT ${col} FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != '' LIMIT ${MAX_DISTINCT_VALUES + 1}`,
        );
        return enumResult(strategy, rows.map((r) => r[0]).filter((v) => v !== null && v !== undefined));
      }
      if (strategy === "array_enum") {
        const { rows } = await chService.executeQuery(
          `SELECT DISTINCT arrayJoin(${col}) AS item FROM ${table} WHERE notEmpty(${col}) LIMIT ${MAX_DISTINCT_VALUES + 1}`,
        );
        return enumResult(strategy, rows.map((r) => r[0]).filter((v) => v !== null && v !== undefined));
      }
      if (strategy === "numeric_range") {
        const { rows } = await chService.executeQuery(
          `SELECT min(${col}), max(${col}), count() FROM ${table} WHERE ${col} IS NOT NULL`,
        );
        if (rows.length > 0 && rows[0].length > 0) {
          if (rows[0].length < 3) {
            throw new Error(`Expected min/max/count columns, received ${rows[0].length}`);
          }
          const [min, max, total] = rows[0];
          return {
            strategy,
            completeness: ValueCompleteness.COMPLETE,
            cached_values: { min, max },
            exact_count: Math.trunc(Number(total)),
            is_exact: true,
          };
        }
      }
      if (strategy === "bounded_search") {
        const { rows } = await chService.executeQuery(
          `SELECT ${col}, count() AS freq FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != '' ` +
            `GROUP BY ${col} ORDER BY freq DESC LIMIT 200`,
        );
        const values = rows.map((r) => r[0]);
        return {
          strategy,
          completeness: ValueCompleteness.PARTIAL,
          cached_values: values,
          exact_count: values.length,
          is_exact: false,
        };
      }
    } catch (err) {
      logger.error(`Value discovery failed for ${tableName}.${columnName}: ${errorMessage(err)}`);
      return { strategy, completeness: ValueCompleteness.FAILED, cached_values: [], exact_count: 0, is_exact: false };
    }
    return deferredResult("deferred");
  }

  /** Runs value discovery over every discovered column and refreshes the registry and cache. */
  async refreshAllValues(): Promise<number> {
    const schema = schemaDiscoveryService.getCachedSchema();
    const targetDb = getSettings().CLICKHOUSE_DATABASE;
    const db = getDb();
    const codec = getCodec();
    const now = new Date();
    let count = 0;

    for (const [tblName, tblInfo] of Object.entries(schema)) {
      for (const [colName, colMeta] of Object.entries(tblInfo.columns)) {
        const res = await this.discoverValuesForColumn(tblName, colName, colMeta.type);
        const values = {
          strategy: res.strategy,
          completeness: res.completeness,
          cached_values: codec.json(res.cached_values),
          exact_count: res.exact_count,
          is_exact: codec.bool(res.is_exact),
          last_refreshed_at: codec.date(now),
        };
        const existing = await db
          .selectFrom("discovered_values")
          .select("id")
          .where("database_name", "=", targetDb)
          .where("table_name", "=", tblName)
          .where("column_name", "=", colName)
          .executeTakeFirst();
        if (existing) {
          await db.updateTable("discovered_values").set(values).where("id", "=", existing.id).execute();
        } else {
          await db
            .insertInto("discovered_values")
            .values({ database_name: targetDb, table_name: tblName, column_name: colName, ...values })
            .execute();
        }
        count += 1;
      }
    }

    await this.loadValueCache();
    this.ready = true;
    return count;
  }

  /** Loads all cached values into memory for prompt construction and normalization. */
  async loadValueCache(): Promise<void> {
    const codec = getCodec();
    const rows = await getDb()
      .selectFrom("discovered_values")
      .selectAll()
      .where("database_name", "=", getSettings().CLICKHOUSE_DATABASE)
      .orderBy("id")
      .execute();
    const cache: Record<string, CachedValueEntry> = {};
    for (const row of rows) {
      const v = toDiscoveredValue(codec, row);
      cache[`${v.table_name}.${v.column_name}`] = {
        table: v.table_name,
        column: v.column_name,
        strategy: v.strategy,
        completeness: v.completeness,
        values: v.cached_values,
        exact_count: v.exact_count,
        is_exact: v.is_exact,
      };
    }
    this.valueCache = cache;
    this.ready = Object.keys(cache).length > 0;
  }

  getCachedValues(): Record<string, CachedValueEntry> {
    return this.valueCache;
  }

  /** Case-insensitive match of user input against verified cached distinct values. */
  normalizeValue(columnKey: string, userInput: string): string | null {
    const values = this.valueCache[columnKey]?.values;
    if (!Array.isArray(values)) return null;
    const needle = userInput.trim().toLowerCase();
    for (const v of values) {
      if (String(v).trim().toLowerCase() === needle) return String(v);
    }
    return null;
  }
}

export const valueDiscoveryService = singleton("valueDiscovery", () => new ValueDiscoveryService());
