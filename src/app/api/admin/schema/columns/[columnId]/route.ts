import type { Updateable } from "kysely";
import { requireAdmin } from "@/server/api/deps";
import { intParam, json, parseBody, route } from "@/server/api/handler";
import { getCodec, getDb, type DiscoveredSchemasTable } from "@/server/core/database";
import { HttpError } from "@/server/core/errors";
import { toDiscoveredColumn } from "@/server/models/entities";
import { columnPolicyUpdateRequestSchema, toDiscoveredColumnResponse } from "@/server/schemas/admin";
import { auditService } from "@/server/services/auditService";
import { schemaDiscoveryService } from "@/server/services/schemaDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Updates a column's approval, sensitivity tier or allowed operations. */
export const PATCH = route<{ columnId: string }>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const columnId = intParam(params.columnId, "column_id");
  const body = await parseBody(request, columnPolicyUpdateRequestSchema);
  const db = getDb();
  const codec = getCodec();

  const existing = await db.selectFrom("discovered_schemas").select("id").where("id", "=", columnId).executeTakeFirst();
  if (!existing) throw new HttpError(404, "Column metadata not found");

  const changes: Updateable<DiscoveredSchemasTable> = {};
  if (body.is_approved !== null) changes.is_approved = codec.bool(body.is_approved);
  if (body.sensitivity !== null) changes.sensitivity = body.sensitivity;
  if (body.allowed_operations !== null) changes.allowed_operations = codec.json(body.allowed_operations);
  if (Object.keys(changes).length > 0) {
    await db.updateTable("discovered_schemas").set(changes).where("id", "=", columnId).execute();
  }

  const row = await db.selectFrom("discovered_schemas").selectAll().where("id", "=", columnId).executeTakeFirstOrThrow();
  const column = toDiscoveredColumn(codec, row);
  await schemaDiscoveryService.loadSchemaCache();

  await auditService.logEvent({
    action: "UPDATE_COLUMN_POLICY",
    resource: `column:${column.table_name}.${column.column_name}`,
    status: "SUCCESS",
    orgId: admin.org_id,
    userId: admin.id,
    details: { approved: column.is_approved, sensitivity: column.sensitivity },
  });
  return json(toDiscoveredColumnResponse(column));
});
