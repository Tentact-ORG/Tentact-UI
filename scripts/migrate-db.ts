/**
 * Brings the application database up to the current schema, as the first
 * start of the app would. An existing SQLite database is backed up next to
 * itself first; with --check it only lists what would change.
 *
 * Usage: npm run migrate-db [-- --check]
 */
import { parseArgs } from "node:util";
import { closeDb, migrateDatabase, pendingSchemaChanges } from "@/server/core/database";
import { errorMessage } from "@/server/core/errors";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  const pending = await pendingSchemaChanges();
  console.log(pending.length > 0 ? `Pending schema changes: ${pending.join(", ")}` : "No schema changes pending for an existing database.");
  if (values.check) return 0;
  await migrateDatabase();
  const remaining = await pendingSchemaChanges();
  if (remaining.length > 0) {
    console.error(`Still missing after the migration: ${remaining.join(", ")}`);
    return 1;
  }
  console.log("The application database is up to date.");
  return 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`Migration failed: ${errorMessage(err)}`);
    await closeDb();
    process.exit(1);
  });
