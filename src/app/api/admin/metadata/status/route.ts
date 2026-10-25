import { requireAuditorOrAdmin } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { getDb } from "@/server/core/database";
import { RelationshipStatus } from "@/server/models/entities";
import type { MetadataStatusResponse } from "@/server/schemas/admin";
import { chService } from "@/server/services/clickhouseClient";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  await requireAuditorOrAdmin(request);
  const db = getDb();
  const [columns, relationships, values, connected] = await Promise.all([
    db.selectFrom("discovered_schemas").select("table_name").execute(),
    db.selectFrom("table_relationships").select("status").execute(),
    db.selectFrom("discovered_values").select("id").execute(),
    chService.isConnected(),
  ]);

  const response: MetadataStatusResponse = {
    database_connected: connected,
    schema_ready: schemaDiscoveryService.isReady,
    tables_discovered: new Set(columns.map((c) => c.table_name)).size,
    columns_discovered: columns.length,
    approved_relationships_count: relationships.filter((r) => r.status === RelationshipStatus.APPROVED).length,
    pending_relationships_count: relationships.filter((r) => r.status === RelationshipStatus.PENDING).length,
    values_cached_count: values.length,
    last_fingerprint: schemaDiscoveryService.lastFingerprint,
    last_refresh_time: schemaDiscoveryService.lastRefreshTime,
  };
  return json(response);
});
