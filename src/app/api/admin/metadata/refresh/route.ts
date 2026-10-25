import { requireAdmin } from "@/server/api/deps";
import { json, route } from "@/server/api/handler";
import { relationshipService } from "@/server/services/relationshipDiscovery";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";
import { valueDiscoveryService } from "@/server/services/valueDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-runs schema, value and relationship discovery against ClickHouse. */
export const POST = route(async (request) => {
  await requireAdmin(request);
  const schema = await schemaDiscoveryService.discoverClickhouseSchema();
  const valuesDiscovered = await valueDiscoveryService.refreshAllValues();
  const candidates = await relationshipService.discoverCandidateRelationships();
  return json({
    status: "refreshed",
    schema,
    values_discovered: valuesDiscovered,
    candidate_relationships: candidates.length,
  });
});
