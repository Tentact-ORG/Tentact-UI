import { Kysely, PostgresDialect, SqliteDialect, sql, type Generated } from "kysely";
import BetterSqlite3 from "better-sqlite3";
import pg from "pg";
import { getSettings } from "./config";
import { getLogger } from "./logger";
import { resolveFromCwd } from "./paths";
import { singleton, resetSingleton } from "./singleton";

const logger = getLogger("leadgen.database");

/*
 * Raw storage types. SQLite (as written by SQLAlchemy) stores booleans as 0/1, JSON as
 * text and timestamps as naive-UTC "YYYY-MM-DD HH:MM:SS.ffffff" strings; PostgreSQL
 * returns native booleans, parsed JSON and Date objects. `RowCodec` converts between
 * these and the domain types in `models/entities.ts`.
 */
export type DbBool = number | boolean;
export type DbDate = string | Date;
export type DbJson = unknown;

export interface OrganizationsTable {
  id: Generated<number>;
  name: string;
  slug: string;
  created_at: DbDate;
}

export interface UsersTable {
  id: Generated<number>;
  org_id: number;
  email: string;
  hashed_password: string;
  full_name: string;
  role: string;
  is_active: DbBool;
  created_at: DbDate;
}

export interface DiscoveredSchemasTable {
  id: Generated<number>;
  database_name: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: DbBool;
  is_primary_key: DbBool;
  is_approved: DbBool;
  sensitivity: string;
  allowed_operations: DbJson;
  discovery_status: string;
  strategy: string;
  last_refreshed_at: DbDate;
}

export interface SchemaFingerprintsTable {
  id: Generated<number>;
  database_name: string;
  fingerprint_hash: string;
  table_count: number;
  column_count: number;
  detected_at: DbDate;
  status: string;
}

export interface DiscoveredValuesTable {
  id: Generated<number>;
  database_name: string;
  table_name: string;
  column_name: string;
  strategy: string;
  completeness: string;
  cached_values: DbJson;
  exact_count: number;
  is_exact: DbBool;
  last_refreshed_at: DbDate;
}

export interface TableRelationshipsTable {
  id: Generated<number>;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: string;
  status: string;
  confidence_score: number;
  evidence: string;
  created_at: DbDate;
  reviewed_at: DbDate | null;
  reviewed_by: string | null;
}

export interface SavedSearchesTable {
  id: Generated<number>;
  org_id: number;
  user_id: number;
  name: string;
  description: string | null;
  natural_query: string | null;
  structured_icp: DbJson;
  intermediate_rep: DbJson;
  /** Client filter state for restoring the search in the dashboard (added after the Python service). */
  ui_state: DbJson | null;
  created_at: DbDate;
}

export interface ProspectListsTable {
  id: Generated<number>;
  org_id: number;
  user_id: number;
  name: string;
  /** Snapshot of the prospects in the list, as shown in the dashboard. */
  items: DbJson;
  item_count: number;
  created_at: DbDate;
}

export interface ExportJobsTable {
  id: Generated<number>;
  org_id: number;
  user_id: number;
  status: string;
  search_target: string;
  total_rows: number;
  file_path: string | null;
  download_token: string | null;
  error_message: string | null;
  query_snapshot: DbJson;
  created_at: DbDate;
  completed_at: DbDate | null;
  expires_at: DbDate;
}

export interface AuditEventsTable {
  id: Generated<number>;
  org_id: number | null;
  user_id: number | null;
  action: string;
  resource: string;
  status: string;
  duration_ms: number;
  details: DbJson | null;
  created_at: DbDate;
}

export interface CreditAccountsTable {
  org_id: number;
  balance: number;
  updated_at: DbDate;
}

export interface CreditLedgerTable {
  id: Generated<number>;
  org_id: number;
  user_id: number | null;
  /** Positive for grants, negative for spending. */
  delta: number;
  balance_after: number;
  reason: string;
  reference: string | null;
  created_at: DbDate;
}

export interface RevealedContactsTable {
  id: Generated<number>;
  org_id: number;
  /** Warehouse person id whose contact details the organization has paid for. */
  contact_id: string;
  user_id: number | null;
  revealed_at: DbDate;
}

export interface CreditRequestsTable {
  id: Generated<number>;
  org_id: number;
  user_id: number;
  credits: number;
  pack: string | null;
  status: string;
  note: string | null;
  created_at: DbDate;
  decided_at: DbDate | null;
  decided_by: string | null;
}

export interface LoginLockoutsTable {
  /** Lower-cased email the attempts were made for (whether or not an account exists). */
  email: string;
  failures: number;
  window_started_at: DbDate;
  locked_until: DbDate | null;
}

export interface Database {
  organizations: OrganizationsTable;
  users: UsersTable;
  discovered_schemas: DiscoveredSchemasTable;
  schema_fingerprints: SchemaFingerprintsTable;
  discovered_values: DiscoveredValuesTable;
  table_relationships: TableRelationshipsTable;
  saved_searches: SavedSearchesTable;
  export_jobs: ExportJobsTable;
  audit_events: AuditEventsTable;
  prospect_lists: ProspectListsTable;
  credit_accounts: CreditAccountsTable;
  credit_ledger: CreditLedgerTable;
  revealed_contacts: RevealedContactsTable;
  credit_requests: CreditRequestsTable;
  login_lockouts: LoginLockoutsTable;
}

/** Tables in dependency order (parents first). */
export const TABLE_NAMES = [
  "organizations",
  "users",
  "discovered_schemas",
  "schema_fingerprints",
  "discovered_values",
  "table_relationships",
  "saved_searches",
  "export_jobs",
  "audit_events",
  "prospect_lists",
  "credit_accounts",
  "credit_ledger",
  "revealed_contacts",
  "credit_requests",
  "login_lockouts",
] as const satisfies readonly (keyof Database)[];

export type DialectName = "sqlite" | "postgres";

export interface RowCodec {
  bool(value: boolean): DbBool;
  readBool(value: unknown): boolean;
  date(value: Date): DbDate;
  readDate(value: unknown): Date;
  readNullableDate(value: unknown): Date | null;
  json(value: unknown): DbJson;
  readJson<T>(value: unknown): T;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Formats a Date the way SQLAlchemy writes naive UTC DateTime values to SQLite. */
function toSqliteTimestamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    `${pad(d.getUTCMilliseconds(), 3)}000`
  );
}

function parseTimestamp(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value !== "string") {
    throw new TypeError(`Unsupported timestamp value: ${String(value)}`);
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
  if (!match) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) throw new TypeError(`Unparseable timestamp: ${value}`);
    return fallback;
  }
  const [, datePart, timePart, fraction = "", zone] = match;
  const millis = fraction ? fraction.slice(0, 4).padEnd(4, "0") : "";
  // Naive values were written as UTC by the application.
  return new Date(`${datePart}T${timePart}${millis}${zone ?? "Z"}`);
}

function parseJsonValue<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

const sqliteCodec: RowCodec = {
  bool: (v) => (v ? 1 : 0),
  readBool: (v) => v === true || v === 1 || v === "1",
  date: toSqliteTimestamp,
  readDate: parseTimestamp,
  readNullableDate: (v) => (v === null || v === undefined ? null : parseTimestamp(v)),
  json: (v) => JSON.stringify(v),
  readJson: parseJsonValue,
};

const postgresCodec: RowCodec = {
  bool: (v) => v,
  readBool: (v) => v === true,
  date: (v) => v,
  readDate: parseTimestamp,
  readNullableDate: (v) => (v === null || v === undefined ? null : parseTimestamp(v)),
  json: (v) => JSON.stringify(v),
  readJson: parseJsonValue,
};

interface ParsedDatabaseUrl {
  dialect: DialectName;
  target: string;
}

/** Accepts the SQLAlchemy-style URLs used by the Python service as well as plain ones. */
export function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  const sqliteMatch = /^sqlite(?:\+\w+)?:\/\/\/(.*)$/.exec(url);
  if (sqliteMatch) {
    const file = sqliteMatch[1] || ":memory:";
    return { dialect: "sqlite", target: file === ":memory:" ? file : resolveFromCwd(file) };
  }
  const pgMatch = /^postgres(?:ql)?(?:\+\w+)?:\/\/(.*)$/.exec(url);
  if (pgMatch) {
    return { dialect: "postgres", target: `postgresql://${pgMatch[1]}` };
  }
  throw new Error("Unsupported DATABASE_URL: expected a sqlite:/// or postgresql:// URL");
}

interface DatabaseHandle {
  db: Kysely<Database>;
  dialect: DialectName;
  codec: RowCodec;
  /** SQLite only: the file (or ":memory:") and its connection, for backups. */
  sqlite?: { file: string; conn: BetterSqlite3.Database };
}

function createHandle(): DatabaseHandle {
  const { dialect, target } = parseDatabaseUrl(getSettings().DATABASE_URL);
  if (dialect === "sqlite") {
    const conn = new BetterSqlite3(target);
    conn.pragma("journal_mode = WAL");
    conn.pragma("busy_timeout = 5000");
    conn.pragma("foreign_keys = ON");
    return { db: new Kysely<Database>({ dialect: new SqliteDialect({ database: conn }) }), dialect, codec: sqliteCodec, sqlite: { file: target, conn } };
  }
  // TIMESTAMP WITHOUT TIME ZONE columns (as created by SQLAlchemy) hold naive UTC values.
  pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value: string) => parseTimestamp(value));
  const pool = new pg.Pool({
    connectionString: target,
    max: Math.max(1, getSettings().DATABASE_POOL_MAX),
    // Hand idle connections back quickly, and fail fast instead of waiting forever for a free one.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), dialect, codec: postgresCodec };
}

function handle(): DatabaseHandle {
  return singleton("database", createHandle);
}

export function getDb(): Kysely<Database> {
  return handle().db;
}

export function getCodec(): RowCodec {
  return handle().codec;
}

export function getDialect(): DialectName {
  return handle().dialect;
}

export async function closeDb(): Promise<void> {
  const registry = globalThis as unknown as Record<symbol, DatabaseHandle | undefined>;
  const current = registry[Symbol.for("leadgen.database")];
  resetSingleton("database");
  if (current) await current.db.destroy();
}

/** Columns added to existing tables after the original schema (see the end of `migrateDatabase`). */
const ADDED_COLUMNS: readonly [keyof Database, string][] = [["saved_searches", "ui_state"]];

async function existingColumns(table: string): Promise<Set<string>> {
  const db = getDb();
  const rows =
    getDialect() === "postgres"
      ? (
          await sql<{ name: string }>`SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = ${table}`.execute(db)
        ).rows
      : (await sql<{ name: string }>`SELECT name FROM pragma_table_info(${table})`.execute(db)).rows;
  return new Set(rows.map((r) => r.name));
}

/** What `migrateDatabase` would add to an existing database: missing tables and columns. Empty for a new database. */
export async function pendingSchemaChanges(): Promise<string[]> {
  const present = new Map<string, Set<string>>();
  for (const table of TABLE_NAMES) present.set(table, await existingColumns(table));
  if (![...present.values()].some((columns) => columns.size > 0)) return [];
  const changes = TABLE_NAMES.filter((table) => present.get(table)?.size === 0).map((table) => `table ${table}`);
  for (const [table, column] of ADDED_COLUMNS) {
    const columns = present.get(table);
    if (columns && columns.size > 0 && !columns.has(column)) changes.push(`column ${table}.${column}`);
  }
  return changes;
}

/**
 * Before changing an existing SQLite database, copies it next to itself
 * (`<file>.backup-<timestamp>`) with SQLite's online backup. Postgres databases
 * are not copied: the log lists the changes so they can be dumped first.
 * Returns the backup path, if one was made.
 */
async function backupBeforeSchemaChange(): Promise<string | null> {
  const changes = await pendingSchemaChanges();
  if (changes.length === 0) return null;
  const sqlite = handle().sqlite;
  if (!sqlite || sqlite.file === ":memory:") {
    logger.warn(`Updating the application database schema (${changes.join(", ")}). Take a backup first if this is a production database.`);
    return null;
  }
  const backupPath = `${sqlite.file}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await sqlite.conn.backup(backupPath);
  logger.info(`Backed up ${sqlite.file} to ${backupPath} before adding ${changes.join(", ")}.`);
  return backupPath;
}

/**
 * Creates the application tables if they do not exist (equivalent of
 * `Base.metadata.create_all`). Index names match SQLAlchemy's so existing
 * databases created by the Python service are left untouched; an existing
 * SQLite database is backed up first when tables or columns will be added.
 */
export async function migrateDatabase(): Promise<void> {
  await backupBeforeSchemaChange();
  const db = getDb();
  const isPg = getDialect() === "postgres";
  const ts = isPg ? sql`timestamptz` : sql`datetime`;
  const json = isPg ? sql`jsonb` : sql`json`;
  const id = isPg ? ("serial" as const) : ("integer" as const);
  const float = isPg ? sql`double precision` : sql`float`;

  await db.schema
    .createTable("organizations")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("name", "varchar(255)", (c) => c.notNull())
    .addColumn("slug", "varchar(100)", (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("email", "varchar(255)", (c) => c.notNull())
    .addColumn("hashed_password", "varchar(255)", (c) => c.notNull())
    .addColumn("full_name", "varchar(255)", (c) => c.notNull())
    .addColumn("role", "varchar(50)", (c) => c.notNull())
    .addColumn("is_active", "boolean", (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("discovered_schemas")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("database_name", "varchar(100)", (c) => c.notNull())
    .addColumn("table_name", "varchar(100)", (c) => c.notNull())
    .addColumn("column_name", "varchar(100)", (c) => c.notNull())
    // ClickHouse types such as Array(Tuple(...)) run past 100 characters.
    .addColumn("data_type", "text", (c) => c.notNull())
    .addColumn("is_nullable", "boolean", (c) => c.notNull())
    .addColumn("is_primary_key", "boolean", (c) => c.notNull())
    .addColumn("is_approved", "boolean", (c) => c.notNull())
    .addColumn("sensitivity", "varchar(50)", (c) => c.notNull())
    .addColumn("allowed_operations", json, (c) => c.notNull())
    .addColumn("discovery_status", "varchar(50)", (c) => c.notNull())
    .addColumn("strategy", "varchar(50)", (c) => c.notNull())
    .addColumn("last_refreshed_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("schema_fingerprints")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("database_name", "varchar(100)", (c) => c.notNull())
    .addColumn("fingerprint_hash", "varchar(64)", (c) => c.notNull())
    .addColumn("table_count", "integer", (c) => c.notNull())
    .addColumn("column_count", "integer", (c) => c.notNull())
    .addColumn("detected_at", ts, (c) => c.notNull())
    .addColumn("status", "varchar(50)", (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("discovered_values")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("database_name", "varchar(100)", (c) => c.notNull())
    .addColumn("table_name", "varchar(100)", (c) => c.notNull())
    .addColumn("column_name", "varchar(100)", (c) => c.notNull())
    .addColumn("strategy", "varchar(50)", (c) => c.notNull())
    .addColumn("completeness", "varchar(50)", (c) => c.notNull())
    .addColumn("cached_values", json, (c) => c.notNull())
    .addColumn("exact_count", "integer", (c) => c.notNull())
    .addColumn("is_exact", "boolean", (c) => c.notNull())
    .addColumn("last_refreshed_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("table_relationships")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("source_table", "varchar(100)", (c) => c.notNull())
    .addColumn("source_column", "varchar(100)", (c) => c.notNull())
    .addColumn("target_table", "varchar(100)", (c) => c.notNull())
    .addColumn("target_column", "varchar(100)", (c) => c.notNull())
    .addColumn("cardinality", "varchar(50)", (c) => c.notNull())
    .addColumn("status", "varchar(50)", (c) => c.notNull())
    .addColumn("confidence_score", float, (c) => c.notNull())
    .addColumn("evidence", "text", (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .addColumn("reviewed_at", ts)
    .addColumn("reviewed_by", "varchar(255)")
    .execute();

  await db.schema
    .createTable("saved_searches")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "varchar(255)", (c) => c.notNull())
    .addColumn("description", "text")
    .addColumn("natural_query", "text")
    .addColumn("structured_icp", json, (c) => c.notNull())
    .addColumn("intermediate_rep", json, (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("export_jobs")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("status", "varchar(50)", (c) => c.notNull())
    .addColumn("search_target", "varchar(50)", (c) => c.notNull())
    .addColumn("total_rows", "integer", (c) => c.notNull())
    .addColumn("file_path", "varchar(500)")
    .addColumn("download_token", "varchar(100)")
    .addColumn("error_message", "text")
    .addColumn("query_snapshot", json, (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .addColumn("completed_at", ts)
    .addColumn("expires_at", ts, (c) => c.notNull())
    .execute();

  await db.schema
    .createTable("audit_events")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.references("users.id").onDelete("set null"))
    .addColumn("action", "varchar(100)", (c) => c.notNull())
    .addColumn("resource", "text", (c) => c.notNull()) // e.g. user:<email up to 255 characters>
    .addColumn("status", "varchar(50)", (c) => c.notNull())
    .addColumn("duration_ms", "integer", (c) => c.notNull())
    .addColumn("details", json)
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();

  const indexes: Array<{ table: keyof Database; column: string; unique?: boolean }> = [
    { table: "organizations", column: "id" },
    { table: "organizations", column: "slug", unique: true },
    { table: "users", column: "id" },
    { table: "users", column: "org_id" },
    { table: "users", column: "email", unique: true },
    { table: "discovered_schemas", column: "id" },
    { table: "discovered_schemas", column: "table_name" },
    { table: "discovered_schemas", column: "column_name" },
    { table: "schema_fingerprints", column: "id" },
    { table: "discovered_values", column: "id" },
    { table: "discovered_values", column: "table_name" },
    { table: "discovered_values", column: "column_name" },
    { table: "table_relationships", column: "id" },
    { table: "table_relationships", column: "source_table" },
    { table: "table_relationships", column: "target_table" },
    { table: "table_relationships", column: "status" },
    { table: "saved_searches", column: "id" },
    { table: "saved_searches", column: "org_id" },
    { table: "saved_searches", column: "user_id" },
    { table: "export_jobs", column: "id" },
    { table: "export_jobs", column: "org_id" },
    { table: "export_jobs", column: "user_id" },
    { table: "export_jobs", column: "status" },
    { table: "export_jobs", column: "download_token", unique: true },
    { table: "audit_events", column: "id" },
    { table: "audit_events", column: "org_id" },
    { table: "audit_events", column: "user_id" },
    { table: "audit_events", column: "action" },
  ];
  for (const { table, column, unique } of indexes) {
    let builder = db.schema.createIndex(`ix_${table}_${column}`).ifNotExists().on(table).column(column);
    if (unique) builder = builder.unique();
    await builder.execute();
  }
  await db.schema
    .createTable("prospect_lists")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("name", "varchar(255)", (c) => c.notNull())
    .addColumn("items", json, (c) => c.notNull())
    .addColumn("item_count", "integer", (c) => c.notNull())
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();
  for (const column of ["org_id", "user_id"]) {
    await db.schema.createIndex(`ix_prospect_lists_${column}`).ifNotExists().on("prospect_lists").column(column).execute();
  }

  await db.schema
    .createTable("credit_accounts")
    .ifNotExists()
    .addColumn("org_id", "integer", (c) => c.primaryKey().references("organizations.id").onDelete("cascade"))
    .addColumn("balance", "integer", (c) => c.notNull())
    .addColumn("updated_at", ts, (c) => c.notNull())
    .execute();
  await db.schema
    .createTable("credit_ledger")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.references("users.id").onDelete("set null"))
    .addColumn("delta", "integer", (c) => c.notNull())
    .addColumn("balance_after", "integer", (c) => c.notNull())
    .addColumn("reason", "varchar(50)", (c) => c.notNull())
    .addColumn("reference", "varchar(255)")
    .addColumn("created_at", ts, (c) => c.notNull())
    .execute();
  await db.schema.createIndex("ix_credit_ledger_org_id").ifNotExists().on("credit_ledger").column("org_id").execute();
  await db.schema
    .createTable("revealed_contacts")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("contact_id", "varchar(100)", (c) => c.notNull())
    .addColumn("user_id", "integer", (c) => c.references("users.id").onDelete("set null"))
    .addColumn("revealed_at", ts, (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex("ux_revealed_contacts_org_contact")
    .ifNotExists()
    .unique()
    .on("revealed_contacts")
    .columns(["org_id", "contact_id"])
    .execute();
  await db.schema
    .createTable("credit_requests")
    .ifNotExists()
    .addColumn("id", id, (c) => c.primaryKey())
    .addColumn("org_id", "integer", (c) => c.notNull().references("organizations.id").onDelete("cascade"))
    .addColumn("user_id", "integer", (c) => c.notNull().references("users.id").onDelete("cascade"))
    .addColumn("credits", "integer", (c) => c.notNull())
    .addColumn("pack", "varchar(50)")
    .addColumn("status", "varchar(20)", (c) => c.notNull())
    .addColumn("note", "text")
    .addColumn("created_at", ts, (c) => c.notNull())
    .addColumn("decided_at", ts)
    .addColumn("decided_by", "varchar(255)")
    .execute();
  await db.schema.createIndex("ix_credit_requests_status").ifNotExists().on("credit_requests").column("status").execute();

  await db.schema
    .createTable("login_lockouts")
    .ifNotExists()
    .addColumn("email", "varchar(255)", (c) => c.primaryKey())
    .addColumn("failures", "integer", (c) => c.notNull())
    .addColumn("window_started_at", ts, (c) => c.notNull())
    .addColumn("locked_until", ts)
    .execute();

  // Columns added after the original schema; databases created by the Python service gain them here.
  for (const [table, column] of ADDED_COLUMNS) await addColumnIfMissing(table, column, json);
  // Postgres enforces varchar lengths (SQLite doesn't): columns created too short are widened.
  for (const [table, column] of WIDENED_COLUMNS) await widenToTextIfLimited(table, column);

  logger.info("Application database schema initialized.");
}

/** Columns first created as varchar(100) that can hold longer values. */
const WIDENED_COLUMNS: readonly [keyof Database, string][] = [
  ["discovered_schemas", "data_type"],
  ["audit_events", "resource"],
];

/** Postgres only: turns a length-limited varchar column into text. */
async function widenToTextIfLimited(table: keyof Database, column: string): Promise<void> {
  if (getDialect() !== "postgres") return;
  const db = getDb();
  const { rows } = await sql<{ n: number }>`SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column} AND character_maximum_length IS NOT NULL`.execute(db);
  if (rows[0].n > 0) {
    await sql`ALTER TABLE ${sql.table(table)} ALTER COLUMN ${sql.ref(column)} TYPE text`.execute(db);
    logger.info(`Widened ${table}.${column} to text.`);
  }
}

/** Adds a nullable column to an existing table unless it is already there. */
async function addColumnIfMissing(table: keyof Database, column: string, type: ReturnType<typeof sql>): Promise<void> {
  if (!(await existingColumns(table)).has(column)) {
    await getDb().schema.alterTable(table).addColumn(column, type).execute();
    logger.info(`Added column ${table}.${column}.`);
  }
}
