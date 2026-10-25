/** Response shapes of the admin API (`/api/admin/*`), as used by the admin console. */

export type UserRole = "ADMIN" | "MEMBER" | "AUDITOR";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  org_id: number;
  is_active: boolean;
}

export interface MetadataStatus {
  database_connected: boolean;
  schema_ready: boolean;
  tables_discovered: number;
  columns_discovered: number;
  approved_relationships_count: number;
  pending_relationships_count: number;
  values_cached_count: number;
  last_fingerprint?: string;
  last_refresh_time?: string;
}

export interface DiscoveredColumn {
  id: number;
  database_name: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
  is_approved: boolean;
  sensitivity: "public" | "internal" | "restricted";
  allowed_operations: string[];
  discovery_status: string;
  last_refreshed_at: string;
}

export interface TableRelationship {
  id: number;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "INVALIDATED";
  confidence_score: number;
  evidence: string;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface AuditEvent {
  id: number;
  org_id?: number;
  user_id?: number;
  action: string;
  resource: string;
  status: string;
  duration_ms: number;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface SchemaDiscoveryResult {
  database: string;
  tables_count: number;
  columns_count: number;
  fingerprint: string;
  schema_changed: boolean;
}

export interface MetadataRefreshResult {
  status: string;
  schema: SchemaDiscoveryResult;
  values_discovered: number;
  candidate_relationships: number;
}
