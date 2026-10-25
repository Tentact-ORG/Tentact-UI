/**
 * Applies supabase/migrations/*.sql to the Supabase database in SUPABASE_DB_URL,
 * in name order, each once and in its own transaction (recorded in
 * public.app_migrations). The same files work with `supabase db push`.
 * With --check it only lists the migrations that haven't been applied.
 *
 * Usage: npm run migrate-supabase [-- --check]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { errorMessage } from "@/server/core/errors";
import { createSupabasePool } from "@/server/services/publicSearchLimit";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("SUPABASE_DB_URL is not set. Add the Supabase Session pooler connection string to .env.");
    return 1;
  }
  const pool = createSupabasePool(url);
  const client = await pool.connect();
  try {
    await client.query("create table if not exists public.app_migrations (name text primary key, applied_at timestamptz not null default now())");
    await client.query("alter table public.app_migrations enable row level security");
    const applied = new Set((await client.query<{ name: string }>("select name from public.app_migrations")).rows.map((row) => row.name));
    const pending = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql") && !applied.has(name))
      .sort();
    console.log(pending.length > 0 ? `Pending migrations: ${pending.join(", ")}` : "The Supabase database is up to date.");
    if (values.check) return 0;
    for (const name of pending) {
      await client.query("begin");
      try {
        await client.query(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"));
        await client.query("insert into public.app_migrations (name) values ($1)", [name]);
        await client.query("commit");
        console.log(`Applied ${name}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`${name}: ${errorMessage(err)}`);
      }
    }
    return 0;
  } finally {
    client.release();
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`Migration failed: ${errorMessage(err)}`);
    process.exit(1);
  });
