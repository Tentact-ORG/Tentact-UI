import { sql } from "kysely";
import { json, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { chService } from "@/server/services/clickhouseClient";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness: application database, ClickHouse connectivity, schema metadata and value
 * discovery. Returns 503 until the platform can serve searches.
 */
export const GET = route(async () => {
  let appDbOk = false;
  try {
    await sql`SELECT 1`.execute(getDb());
    appDbOk = true;
  } catch {
    appDbOk = false;
  }
  const chOk = await chService.isConnected();
  const schemaReady = schemaDiscoveryService.isReady;
  const valuesReady = valueDiscoveryService.isReady;
  const ready = appDbOk && chOk && schemaReady;

  return json(
    {
      status: ready ? "ready" : "degraded",
      components: {
        app_database: appDbOk ? "connected" : "unavailable",
        clickhouse: chOk ? "connected" : "unavailable",
        schema_metadata: schemaReady ? "ready" : "initializing",
        value_discovery: valuesReady ? "ready" : "discovering",
      },
      fingerprint: schemaDiscoveryService.lastFingerprint,
      search_capable: ready,
    },
    ready ? 200 : 503,
  );
});
