import type { Selectable } from "kysely";
import type {
  AuditEventsTable,
  DiscoveredSchemasTable,
  DiscoveredValuesTable,
  ExportJobsTable,
  OrganizationsTable,
  ProspectListsTable,
  RowCodec,
  SavedSearchesTable,
  TableRelationshipsTable,
  UsersTable,
} from "../core/database";

export const UserRole = { ADMIN: "ADMIN", MEMBER: "MEMBER", AUDITOR: "AUDITOR" } as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole) as [UserRole, ...UserRole[]];

export const SensitivityLevel = { PUBLIC: "public", INTERNAL: "internal", RESTRICTED: "restricted" } as const;
export type SensitivityLevel = (typeof SensitivityLevel)[keyof typeof SensitivityLevel];
export const SENSITIVITY_LEVELS = Object.values(SensitivityLevel) as [SensitivityLevel, ...SensitivityLevel[]];

export const RelationshipStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  INVALIDATED: "INVALIDATED",
} as const;
export type RelationshipStatus = (typeof RelationshipStatus)[keyof typeof RelationshipStatus];
export const RELATIONSHIP_STATUSES = Object.values(RelationshipStatus) as [RelationshipStatus, ...RelationshipStatus[]];

export const ValueCompleteness = {
  COMPLETE: "complete",
  PARTIAL: "partial",
  DEFERRED: "deferred",
  FAILED: "failed",
} as const;
export type ValueCompleteness = (typeof ValueCompleteness)[keyof typeof ValueCompleteness];

export const ExportStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

export const DEFAULT_ALLOWED_OPERATIONS = ["select", "filter", "sort", "group"];

export interface Organization {
  id: number;
  name: string;
  slug: string;
  created_at: Date;
}

export interface User {
  id: number;
  org_id: number;
  email: string;
  hashed_password: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: Date;
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
  sensitivity: string;
  allowed_operations: string[];
  discovery_status: string;
  strategy: string;
  last_refreshed_at: Date;
}

export interface DiscoveredValue {
  id: number;
  database_name: string;
  table_name: string;
  column_name: string;
  strategy: string;
  completeness: string;
  cached_values: unknown;
  exact_count: number;
  is_exact: boolean;
  last_refreshed_at: Date;
}

export interface TableRelationship {
  id: number;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  cardinality: string;
  status: string;
  confidence_score: number;
  evidence: string;
  created_at: Date;
  reviewed_at: Date | null;
  reviewed_by: string | null;
}

export interface SavedSearch {
  id: number;
  org_id: number;
  user_id: number;
  name: string;
  description: string | null;
  natural_query: string | null;
  structured_icp: unknown;
  intermediate_rep: unknown;
  ui_state: unknown;
  created_at: Date;
}

export interface ProspectList {
  id: number;
  org_id: number;
  user_id: number;
  name: string;
  items: unknown[];
  item_count: number;
  created_at: Date;
}

export interface ExportJob {
  id: number;
  org_id: number;
  user_id: number;
  status: string;
  search_target: string;
  total_rows: number;
  file_path: string | null;
  download_token: string | null;
  error_message: string | null;
  query_snapshot: unknown;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date;
}

export interface AuditEvent {
  id: number;
  org_id: number | null;
  user_id: number | null;
  action: string;
  resource: string;
  status: string;
  duration_ms: number;
  details: Record<string, unknown> | null;
  created_at: Date;
}

/* Row -> entity mappers (storage representation to domain types). */

export const toOrganization = (c: RowCodec, r: Selectable<OrganizationsTable>): Organization => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  created_at: c.readDate(r.created_at),
});

export const toUser = (c: RowCodec, r: Selectable<UsersTable>): User => ({
  id: r.id,
  org_id: r.org_id,
  email: r.email,
  hashed_password: r.hashed_password,
  full_name: r.full_name,
  role: r.role,
  is_active: c.readBool(r.is_active),
  created_at: c.readDate(r.created_at),
});

export const toDiscoveredColumn = (c: RowCodec, r: Selectable<DiscoveredSchemasTable>): DiscoveredColumn => ({
  id: r.id,
  database_name: r.database_name,
  table_name: r.table_name,
  column_name: r.column_name,
  data_type: r.data_type,
  is_nullable: c.readBool(r.is_nullable),
  is_primary_key: c.readBool(r.is_primary_key),
  is_approved: c.readBool(r.is_approved),
  sensitivity: r.sensitivity,
  allowed_operations: c.readJson<string[]>(r.allowed_operations),
  discovery_status: r.discovery_status,
  strategy: r.strategy,
  last_refreshed_at: c.readDate(r.last_refreshed_at),
});

export const toDiscoveredValue = (c: RowCodec, r: Selectable<DiscoveredValuesTable>): DiscoveredValue => ({
  id: r.id,
  database_name: r.database_name,
  table_name: r.table_name,
  column_name: r.column_name,
  strategy: r.strategy,
  completeness: r.completeness,
  cached_values: c.readJson<unknown>(r.cached_values),
  exact_count: r.exact_count,
  is_exact: c.readBool(r.is_exact),
  last_refreshed_at: c.readDate(r.last_refreshed_at),
});

export const toTableRelationship = (c: RowCodec, r: Selectable<TableRelationshipsTable>): TableRelationship => ({
  id: r.id,
  source_table: r.source_table,
  source_column: r.source_column,
  target_table: r.target_table,
  target_column: r.target_column,
  cardinality: r.cardinality,
  status: r.status,
  confidence_score: r.confidence_score,
  evidence: r.evidence,
  created_at: c.readDate(r.created_at),
  reviewed_at: c.readNullableDate(r.reviewed_at),
  reviewed_by: r.reviewed_by,
});

export const toSavedSearch = (c: RowCodec, r: Selectable<SavedSearchesTable>): SavedSearch => ({
  id: r.id,
  org_id: r.org_id,
  user_id: r.user_id,
  name: r.name,
  description: r.description,
  natural_query: r.natural_query,
  structured_icp: c.readJson<unknown>(r.structured_icp),
  intermediate_rep: c.readJson<unknown>(r.intermediate_rep),
  ui_state: r.ui_state === null || r.ui_state === undefined ? null : c.readJson<unknown>(r.ui_state),
  created_at: c.readDate(r.created_at),
});

export const toProspectList = (c: RowCodec, r: Selectable<ProspectListsTable>): ProspectList => ({
  id: r.id,
  org_id: r.org_id,
  user_id: r.user_id,
  name: r.name,
  items: c.readJson<unknown[]>(r.items),
  item_count: r.item_count,
  created_at: c.readDate(r.created_at),
});

export const toExportJob = (c: RowCodec, r: Selectable<ExportJobsTable>): ExportJob => ({
  id: r.id,
  org_id: r.org_id,
  user_id: r.user_id,
  status: r.status,
  search_target: r.search_target,
  total_rows: r.total_rows,
  file_path: r.file_path,
  download_token: r.download_token,
  error_message: r.error_message,
  query_snapshot: c.readJson<unknown>(r.query_snapshot),
  created_at: c.readDate(r.created_at),
  completed_at: c.readNullableDate(r.completed_at),
  expires_at: c.readDate(r.expires_at),
});

export const toAuditEvent = (c: RowCodec, r: Selectable<AuditEventsTable>): AuditEvent => ({
  id: r.id,
  org_id: r.org_id,
  user_id: r.user_id,
  action: r.action,
  resource: r.resource,
  status: r.status,
  duration_ms: r.duration_ms,
  details: r.details === null ? null : c.readJson<Record<string, unknown> | null>(r.details),
  created_at: c.readDate(r.created_at),
});
