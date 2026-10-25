import { getSettings } from "../core/config";
import { SensitivityLevel, UserRole } from "../models/entities";
import { analyzeSql, SqlParseError, type SqlAnalysis } from "./clickhouseSql";
import { relationshipService } from "./relationshipDiscovery";
import { schemaDiscoveryService, type CachedColumn, type SchemaCache } from "./schemaDiscovery";

/** ClickHouse functions / table functions that can read host files or reach external systems. */
const DANGEROUS_FUNCTIONS = new Set([
  "file", "url", "remote", "remotesecure", "mysql", "postgresql", "s3", "hdfs", "executable", "sleep",
  "eval", "system", "cluster", "clusterallreplicas", "clustersallreplicas", "s3cluster", "urlcluster",
  "hdfscluster", "filecluster", "jdbc", "odbc", "mongodb", "redis", "sqlite", "azureblobstorage", "gcs",
  "input", "deltalake", "iceberg", "hudi",
]);

const SYSTEM_DATABASES = new Set(["system", "information_schema"]);

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

function effectiveTableName(name: string, schema: SchemaCache): string {
  return name === "new_company_data_10_26" && "new_company_data" in schema ? "new_company_data" : name;
}

const SENSITIVITY_RANK: Record<string, number> = {
  [SensitivityLevel.PUBLIC]: 0,
  [SensitivityLevel.INTERNAL]: 1,
  [SensitivityLevel.RESTRICTED]: 2,
};

/**
 * Deterministic SQL validation layer. Enforces read-only single SELECT statements,
 * table allowlists, approved joins, role-based column sensitivity, banned functions
 * and interactive LIMIT caps — independently of what the LLM agents decided.
 */
class DeterministicSQLValidator {
  validateSql(sql: string, userRole: string, isExport = false, maxAllowedLimit = 1000): ValidationResult {
    if (!sql || !sql.trim()) return { valid: false, violations: ["Query is empty."] };

    let analysis: SqlAnalysis;
    try {
      analysis = analyzeSql(sql);
    } catch (err) {
      const message = err instanceof SqlParseError ? err.message : String(err);
      return { valid: false, violations: [`SQL syntax error: ${message}`] };
    }

    if (analysis.statementCount === 0) return { valid: false, violations: ["Query is empty."] };
    if (analysis.statementCount !== 1) {
      return {
        valid: false,
        violations: [`Multi-statement execution rejected. Found ${analysis.statementCount} statements.`],
      };
    }
    if (analysis.statementKeyword !== "SELECT" && analysis.statementKeyword !== "WITH") {
      return {
        valid: false,
        violations: [
          `Forbidden statement type: ${analysis.statementKeyword ?? "UNKNOWN"}. Only read-only SELECT queries are allowed.`,
        ],
      };
    }

    const violations = new Set<string>();
    for (const keyword of analysis.mutationKeywords) {
      violations.add(`Forbidden mutation construct found: ${keyword.charAt(0)}${keyword.slice(1).toLowerCase()}`);
    }

    const schema = schemaDiscoveryService.getCachedSchema();
    const targetDb = getSettings().CLICKHOUSE_DATABASE;

    // 1. Table allowlist
    if (analysis.tables.length === 0) violations.add("Query must reference at least one table.");
    const realTables = analysis.tables.filter((t) => !(t.db === null && !t.isFunction && analysis.cteNames.has(t.name)));
    for (const t of realTables) {
      if (t.db && SYSTEM_DATABASES.has(t.db.toLowerCase())) {
        violations.add(`Access to system catalog '${t.db}' is forbidden.`);
      }
      if (t.db && t.db !== targetDb) {
        violations.add(`Access to database '${t.db}' is forbidden. Configured database is '${targetDb}'.`);
      }
      const effective = effectiveTableName(t.name, schema);
      if (!(effective in schema)) {
        violations.add(`Unknown or unindexed table '${t.name}'.`);
      } else if (!schema[effective].is_approved) {
        violations.add(`Table '${t.name}' is not approved for production queries.`);
      }
    }

    // 2. Joins must follow admin-approved relationships
    const tableNames = [...new Set(realTables.map((t) => t.name))];
    if (analysis.hasJoin && realTables.filter((t) => t.name in schema).length >= 2) {
      for (let i = 0; i < tableNames.length; i++) {
        for (let j = i + 1; j < tableNames.length; j++) {
          if (!relationshipService.isJoinApproved(tableNames[i], tableNames[j])) {
            violations.add(
              `Unapproved table join between '${tableNames[i]}' and '${tableNames[j]}'. Relationship must be approved by admin.`,
            );
          }
        }
      }
    }

    // 3. Column approval and sensitivity (explicit references and wildcards)
    const aliasToTable = new Map<string, string>();
    for (const t of realTables) {
      aliasToTable.set(t.name, t.name);
      if (t.alias) aliasToTable.set(t.alias, t.name);
    }
    const resolveTables = (qualifier: string | null): string[] => {
      const direct = qualifier ? aliasToTable.get(qualifier) : undefined;
      return (direct ? [direct] : tableNames).map((n) => effectiveTableName(n, schema)).filter((n) => n in schema);
    };

    const checkColumn = (columnName: string, matches: Array<[string, CachedColumn]>) => {
      let sensitivity: string = SensitivityLevel.PUBLIC;
      for (const [table, meta] of matches) {
        if (!meta.is_approved) violations.add(`Column '${table}.${columnName}' is marked unapproved.`);
        if ((SENSITIVITY_RANK[meta.sensitivity] ?? 0) > (SENSITIVITY_RANK[sensitivity] ?? 0)) sensitivity = meta.sensitivity;
      }
      if (sensitivity === SensitivityLevel.RESTRICTED && userRole !== UserRole.ADMIN) {
        violations.add(`Access denied: Column '${columnName}' is classified as RESTRICTED and requires ADMIN role.`);
      } else if (sensitivity === SensitivityLevel.INTERNAL && userRole !== UserRole.ADMIN && userRole !== UserRole.AUDITOR) {
        violations.add(`Access denied: Column '${columnName}' is classified as INTERNAL and requires elevated role.`);
      }
    };

    for (const col of analysis.columns) {
      const matches = resolveTables(col.qualifier)
        .filter((t) => col.name in schema[t].columns)
        .map((t): [string, CachedColumn] => [t, schema[t].columns[col.name]]);
      if (matches.length > 0) checkColumn(col.name, matches);
    }
    for (const wildcard of analysis.wildcards) {
      for (const table of resolveTables(wildcard.qualifier)) {
        for (const [name, meta] of Object.entries(schema[table].columns)) {
          checkColumn(name, [[table, meta]]);
        }
      }
    }

    // 4. Dangerous functions
    for (const fn of analysis.functions) {
      if (DANGEROUS_FUNCTIONS.has(fn.toLowerCase())) violations.add(`Forbidden function call '${fn}' detected.`);
    }

    // 5. LIMIT enforcement for interactive queries
    if (!isExport) {
      if (!analysis.limit.present) {
        violations.add(`Interactive queries must specify a LIMIT clause (max ${maxAllowedLimit}).`);
      } else if (analysis.limit.value !== null && analysis.limit.value > maxAllowedLimit) {
        violations.add(`Requested LIMIT (${analysis.limit.value}) exceeds maximum permitted (${maxAllowedLimit}).`);
      }
    }

    return { valid: violations.size === 0, violations: [...violations] };
  }
}

export const sqlValidator = new DeterministicSQLValidator();
