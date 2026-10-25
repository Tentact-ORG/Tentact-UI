import { z } from "zod";
import {
  RELATIONSHIP_STATUSES,
  SENSITIVITY_LEVELS,
  type AuditEvent,
  type DiscoveredColumn,
  type TableRelationship,
} from "../models/entities";

export const relationshipActionRequestSchema = z.object({
  status: z.enum(RELATIONSHIP_STATUSES),
});

export const columnPolicyUpdateRequestSchema = z.object({
  is_approved: z.boolean().nullable().default(null),
  sensitivity: z.enum(SENSITIVITY_LEVELS).nullable().default(null),
  allowed_operations: z.array(z.string().max(50)).max(20).nullable().default(null),
});

export interface MetadataStatusResponse {
  database_connected: boolean;
  schema_ready: boolean;
  tables_discovered: number;
  columns_discovered: number;
  approved_relationships_count: number;
  pending_relationships_count: number;
  values_cached_count: number;
  last_fingerprint: string | null;
  last_refresh_time: Date | null;
}

export function toDiscoveredColumnResponse(c: DiscoveredColumn) {
  return {
    id: c.id,
    database_name: c.database_name,
    table_name: c.table_name,
    column_name: c.column_name,
    data_type: c.data_type,
    is_nullable: c.is_nullable,
    is_primary_key: c.is_primary_key,
    is_approved: c.is_approved,
    sensitivity: c.sensitivity,
    allowed_operations: c.allowed_operations,
    discovery_status: c.discovery_status,
    last_refreshed_at: c.last_refreshed_at,
  };
}

export function toTableRelationshipResponse(r: TableRelationship) {
  return {
    id: r.id,
    source_table: r.source_table,
    source_column: r.source_column,
    target_table: r.target_table,
    target_column: r.target_column,
    cardinality: r.cardinality,
    status: r.status,
    confidence_score: r.confidence_score,
    evidence: r.evidence,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    reviewed_by: r.reviewed_by,
  };
}

export function toAuditEventResponse(e: AuditEvent) {
  return {
    id: e.id,
    org_id: e.org_id,
    user_id: e.user_id,
    action: e.action,
    resource: e.resource,
    status: e.status,
    duration_ms: e.duration_ms,
    details: e.details,
    created_at: e.created_at,
  };
}
