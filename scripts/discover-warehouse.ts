/**
 * Discovers the ClickHouse warehouse into the application database: tables and
 * columns (with their approval and sensitivity), candidate joins, and every
 * column's distinct values. The app does this on start, but hosts that limit
 * how long a request may run (Vercel) can't finish it; run this once from a
 * machine without that limit, pointing DATABASE_URL at the production database.
 *
 * Usage: npm run discover-warehouse [-- --schema-only]
 */
import { parseArgs } from "node:util";
import { closeDb, migrateDatabase } from "@/server/core/database";
import { errorMessage } from "@/server/core/errors";
import { chService } from "@/server/services/clickhouseClient";
import { relationshipService } from "@/server/services/relationshipDiscovery";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { "schema-only": { type: "boolean", default: false } } });
  await migrateDatabase();
  if (!(await chService.isConnected())) {
    console.error("Can't reach ClickHouse: check the CLICKHOUSE_* settings.");
    return 1;
  }
  const started = Date.now();
  const schema = await schemaDiscoveryService.discoverClickhouseSchema();
  console.log(`Schema: ${schema.tables_count} tables, ${schema.columns_count} columns${schema.unchanged ? " (already up to date)" : " saved"}.`);
  if (!schema.unchanged) {
    const relationships = await relationshipService.discoverCandidateRelationships();
    console.log(`Candidate joins: ${relationships.length}.`);
  }
  if (!values["schema-only"]) {
    console.log("Discovering distinct values for every column (this takes a few minutes)…");
    const count = await valueDiscoveryService.refreshAllValues();
    console.log(`Values: ${count} columns refreshed.`);
  }
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s.`);
  return 0;
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`Discovery failed: ${errorMessage(err)}`);
    await closeDb();
    process.exit(1);
  });
