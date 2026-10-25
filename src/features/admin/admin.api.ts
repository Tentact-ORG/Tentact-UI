"use client";

import { apiRequest } from "@/features/dashboard/api/dashboard.api";
import type { AuditEvent, DiscoveredColumn, MetadataRefreshResult, MetadataStatus, TableRelationship, User } from "./admin.types";

/** Admin API client; authenticated by the dashboard session cookie like the rest of the workspace API. */
export const adminApi = {
  me: () => apiRequest<{ user: User }>("/api/auth/me"),
  getMetadataStatus: () => apiRequest<MetadataStatus>("/api/admin/metadata/status"),
  triggerMetadataRefresh: () => apiRequest<MetadataRefreshResult>("/api/admin/metadata/refresh", { method: "POST" }),
  listDiscoveredColumns: () => apiRequest<DiscoveredColumn[]>("/api/admin/schema/columns"),
  updateColumnPolicy: (id: number, data: { is_approved?: boolean; sensitivity?: string; allowed_operations?: string[] }) =>
    apiRequest<DiscoveredColumn>(`/api/admin/schema/columns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listRelationships: () => apiRequest<TableRelationship[]>("/api/admin/relationships"),
  updateRelationshipStatus: (id: number, status: string) =>
    apiRequest<TableRelationship>(`/api/admin/relationships/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  listUsers: () => apiRequest<User[]>("/api/admin/users"),
  createUser: (data: { email: string; password: string; full_name: string; role: string; workspace_name?: string | null; starting_credits?: number | null }) =>
    apiRequest<User & { workspace: { id: number; name: string } | null; credits_granted: number }>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  deleteUser: (id: number) => apiRequest<{ id: number; deleted: boolean }>(`/api/admin/users/${id}`, { method: "DELETE" }),
  /** Whether the signed-in user is a credit operator (may create workspaces and give credits). */
  creditStatus: () => apiRequest<{ is_operator: boolean }>("/api/credits"),
  updateUser: (id: number, data: { role?: string; is_active?: boolean }) =>
    apiRequest<User>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listAuditEvents: () => apiRequest<AuditEvent[]>("/api/admin/audit"),
};
