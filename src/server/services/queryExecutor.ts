import { errorMessage } from "../core/errors";
import { getLogger } from "../core/logger";
import { chService } from "./clickhouseClient";

const logger = getLogger("leadgen.query_executor");

export interface SearchExecutionResult {
  records: Record<string, unknown>[];
  total_count: number;
  exact_count: boolean;
  columns: string[];
  duration_ms: number;
}

const DATETIME_TYPE = /^(?:Nullable\()?(?:LowCardinality\()?DateTime(?:64)?\b/;

/** Matches Python's datetime.isoformat() for ClickHouse "YYYY-MM-DD HH:MM:SS[.fff]" values. */
function toIsoFormat(value: unknown, type: string): unknown {
  if (typeof value === "string" && DATETIME_TYPE.test(type)) {
    return value.replace(" ", "T");
  }
  return value;
}

/**
 * Rewrites known LLM output quirks: the `new_company_data_10_26` alias, `splitBy(` and
 * unsafe `toInt32(` casts (which abort the query on malformed input).
 */
export function sanitizeClickhouseSql(sql: string): string;
export function sanitizeClickhouseSql(sql: string | null): string | null;
export function sanitizeClickhouseSql(sql: string | null): string | null {
  if (!sql) return sql;
  return sql
    .replaceAll("new_company_data_10_26", "new_company_data")
    .replaceAll("splitBy(", "splitByChar(")
    .replace(/\btoInt32\(/g, "toInt32OrZero(");
}

/** Controlled query execution with exact distinct-entity counts. */
class QueryExecutorService {
  async executeSearchQuery(
    clickhouseSql: string,
    countSql: string | null = null,
    parameters: Record<string, unknown> | null = null,
    timeoutSec?: number,
  ): Promise<SearchExecutionResult> {
    const start = performance.now();
    let totalCount = 0;
    let exactCount = false;

    const dataSql = sanitizeClickhouseSql(clickhouseSql);
    const sanitizedCountSql = sanitizeClickhouseSql(countSql);

    if (sanitizedCountSql && sanitizedCountSql.trim()) {
      try {
        const { rows } = await chService.executeQuery(sanitizedCountSql, parameters, timeoutSec);
        if (rows.length > 0 && rows[0].length > 0) {
          totalCount = Math.trunc(Number(rows[0][0]));
          exactCount = true;
        }
      } catch (err) {
        logger.warn(`[QUERY EXECUTOR] ClickHouse count query failed or timed out: ${errorMessage(err)}\nCount SQL: ${sanitizedCountSql}`);
        totalCount = -1;
        exactCount = false;
      }
    }

    let result;
    try {
      result = await chService.executeQuery(dataSql, parameters, timeoutSec);
    } catch (err) {
      logger.error(`[QUERY EXECUTOR] ClickHouse query execution error: ${errorMessage(err)}\nSQL: ${dataSql}`);
      throw err;
    }
    const durationMs = performance.now() - start;

    if (result.rows.length === 0) {
      logger.warn(
        `[QUERY EXECUTOR] Query returned 0 rows. Check table contents, case sensitivity, or filter values.\nExecuted SQL: ${dataSql}`,
      );
    }

    const records = result.rows.map((row) => {
      const record: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        record[col] = toIsoFormat(row[i], result.types[i] ?? "");
      });
      return record;
    });

    if (!sanitizedCountSql || totalCount === -1) totalCount = records.length;

    return { records, total_count: totalCount, exact_count: exactCount, columns: result.columns, duration_ms: durationMs };
  }
}

export const queryExecutor = new QueryExecutorService();
