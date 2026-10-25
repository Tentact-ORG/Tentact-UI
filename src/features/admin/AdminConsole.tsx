"use client";

import React, { useState, useEffect, useCallback } from "react";
import { errorText } from "@/features/dashboard/api/dashboard.api";
import { adminApi as api } from "./admin.api";
import type { AuditEvent, DiscoveredColumn, MetadataStatus, TableRelationship, User, UserRole } from "./admin.types";
import styles from "./AdminConsole.module.css";


type AdminTab = "metadata" | "relationships" | "columns" | "users" | "audit";

const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "metadata", label: "📊 Schema Discovery & Health" },
  { key: "relationships", label: "🔗 Relationship Approvals" },
  { key: "columns", label: "🛡️ Column Policies & Permissions" },
  { key: "users", label: "👥 Users & Roles" },
  { key: "audit", label: "📜 Audit Logs & Metrics" },
];

interface AdminData {
  status: MetadataStatus;
  columns: DiscoveredColumn[];
  relationships: TableRelationship[];
  users: User[];
  auditEvents: AuditEvent[];
}

/** User management is administrator-only; auditors see everything else read-only. */
async function fetchAdminData(canManageUsers: boolean): Promise<AdminData> {
  const [status, columns, relationships, users, auditEvents] = await Promise.all([
    api.getMetadataStatus(),
    api.listDiscoveredColumns(),
    api.listRelationships(),
    canManageUsers ? api.listUsers() : Promise.resolve([]),
    api.listAuditEvents(),
  ]);
  return { status, columns, relationships, users, auditEvents };
}

export const AdminConsole: React.FC<{ role: string }> = ({ role }) => {
  const canManageUsers = role === "ADMIN";
  const [activeTab, setActiveTab] = useState<AdminTab>("metadata");
  const [statusData, setStatusData] = useState<MetadataStatus | null>(null);
  const [columns, setColumns] = useState<DiscoveredColumn[]>([]);
  const [relationships, setRelationships] = useState<TableRelationship[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New User Form State
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("MEMBER");
  const [showUserModal, setShowUserModal] = useState(false);

  const applyAdminData = useCallback((data: AdminData) => {
    setStatusData(data.status);
    setColumns(data.columns);
    setRelationships(data.relationships);
    setUsers(data.users);
    setAuditEvents(data.auditEvents);
  }, []);

  const loadData = async () => {
    try {
      applyAdminData(await fetchAdminData(canManageUsers));
    } catch (err: unknown) {
      setErrorMsg(errorText(err, "Failed to load admin data"));
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchAdminData(canManageUsers)
      .then((data) => {
        if (!cancelled) applyAdminData(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorMsg(errorText(err, "Failed to load admin data"));
      });
    return () => {
      cancelled = true;
    };
  }, [applyAdminData, canManageUsers]);

  const handleTriggerRefresh = async () => {
    setIsRefreshing(true);
    try {
      await api.triggerMetadataRefresh();
      await loadData();
    } catch (err: unknown) {
      alert("Refresh failed: " + errorText(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRelationshipAction = async (id: number, newStatus: string) => {
    try {
      await api.updateRelationshipStatus(id, newStatus);
      await loadData();
    } catch (err: unknown) {
      alert("Failed to update relationship: " + errorText(err));
    }
  };

  const handleUpdateColumnPolicy = async (
    id: number,
    data: { is_approved?: boolean; sensitivity?: string }
  ) => {
    try {
      await api.updateColumnPolicy(id, data);
      await loadData();
    } catch (err: unknown) {
      alert("Failed to update column policy: " + errorText(err));
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({
        email: newUserEmail,
        password: newUserPassword,
        full_name: newUserName,
        role: newUserRole,
      });
      setShowUserModal(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      await loadData();
    } catch (err: unknown) {
      alert("Failed to create user: " + errorText(err));
    }
  };

  const handleToggleUserActive = async (user: User) => {
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      await loadData();
    } catch (err: unknown) {
      alert("Failed to update user: " + errorText(err));
    }
  };

  return (
    <div className={styles.root} style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 0" }}>
      {/* Top Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontSize: "1.75rem", color: "var(--text-main)" }}>
            Administrator Control Center
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
            Real-time schema reflection, candidate relationship approvals, column sensitivity policies, and audit metrics.
          </p>
        </div>

        <button className="btn btn-primary" onClick={handleTriggerRefresh} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing ClickHouse..." : "🔄 Trigger Discovery Refresh"}
        </button>
      </div>

      {errorMsg && (
        <div style={{ padding: "12px", background: "rgba(244, 63, 94, 0.15)", color: "var(--accent-rose)", borderRadius: "var(--radius-md)", marginBottom: "20px" }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Tabs Bar */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: "12px",
          marginBottom: "24px",
          overflowX: "auto",
        }}
      >
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`btn ${activeTab === tab.key ? "btn-primary" : "btn-outline"}`}
            style={{ borderRadius: "var(--radius-md)" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: METADATA & SCHEMA HEALTH */}
      {activeTab === "metadata" && (
        <div>
          {/* Status Metric Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
            <div className="glass-panel" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>ClickHouse Engine</div>
              <div style={{ marginTop: "6px" }}>
                <span className={`badge ${statusData?.database_connected ? "badge-success" : "badge-danger"}`}>
                  {statusData?.database_connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Schema Readiness</div>
              <div style={{ marginTop: "6px" }}>
                <span className={`badge ${statusData?.schema_ready ? "badge-success" : "badge-warning"}`}>
                  {statusData?.schema_ready ? "Ready" : "Initializing"}
                </span>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Discovered Objects</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "4px" }}>
                {statusData?.tables_discovered} tables / {statusData?.columns_discovered} columns
              </div>
            </div>

            <div className="glass-panel" style={{ padding: "18px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Approved Joins</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-emerald)", marginTop: "4px" }}>
                {statusData?.approved_relationships_count} approved ({statusData?.pending_relationships_count} pending)
              </div>
            </div>
          </div>

          {/* Fingerprint Info */}
          <div className="glass-panel" style={{ padding: "18px", marginBottom: "28px" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)" }}>
              Active Schema Fingerprint (SHA-256):
            </div>
            <code style={{ fontSize: "0.8rem", color: "var(--accent-cyan)", fontFamily: "var(--font-mono)" }}>
              {statusData?.last_fingerprint || "None"}
            </code>
            <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "6px" }}>
              Last refresh: {statusData?.last_refresh_time ? new Date(statusData.last_refresh_time).toLocaleString() : "Startup"}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RELATIONSHIP APPROVAL WORKFLOW */}
      {activeTab === "relationships" && (
        <div>
          <div className="glass-panel" style={{ padding: "18px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "6px" }}>Table Join Approval Registry</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Inferred foreign-key relationships are strictly blocked from LLM execution until explicitly approved by an administrator.
            </p>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source Table & Key</th>
                  <th>Target Table & Key</th>
                  <th>Cardinality</th>
                  <th>Evidence & Matching</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {relationships.map((rel) => (
                  <tr key={rel.id}>
                    <td>
                      <code style={{ color: "var(--text-main)" }}>{rel.source_table}.{rel.source_column}</code>
                    </td>
                    <td>
                      <code style={{ color: "var(--text-main)" }}>{rel.target_table}.{rel.target_column}</code>
                    </td>
                    <td>{rel.cardinality}</td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "250px" }}>{rel.evidence}</td>
                    <td>
                      <span
                        className={`badge ${
                          rel.status === "APPROVED"
                            ? "badge-success"
                            : rel.status === "REJECTED"
                            ? "badge-danger"
                            : "badge-warning"
                        }`}
                      >
                        {rel.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {rel.status !== "APPROVED" && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                            onClick={() => handleRelationshipAction(rel.id, "APPROVED")}
                          >
                            Approve
                          </button>
                        )}
                        {rel.status !== "REJECTED" && (
                          <button
                            className="btn btn-danger"
                            style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                            onClick={() => handleRelationshipAction(rel.id, "REJECTED")}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: COLUMN POLICIES & SENSITIVITY */}
      {activeTab === "columns" && (
        <div>
          <div className="glass-panel" style={{ padding: "18px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "6px" }}>Column Access & Sensitivity Policies</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Configure column visibility allowlists and sensitivity tiers (Public, Internal, Restricted). Restricted columns cannot be queried by ordinary members.
            </p>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Column</th>
                  <th>ClickHouse Type</th>
                  <th>Primary Key</th>
                  <th>Sensitivity</th>
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col) => (
                  <tr key={col.id}>
                    <td>{col.table_name}</td>
                    <td><code style={{ fontWeight: 600 }}>{col.column_name}</code></td>
                    <td><span className="badge badge-neutral">{col.data_type}</span></td>
                    <td>{col.is_primary_key ? "🔑 Yes" : "No"}</td>
                    <td>
                      <select
                        className="input-field"
                        value={col.sensitivity}
                        onChange={(e) => handleUpdateColumnPolicy(col.id, { sensitivity: e.target.value })}
                        style={{ padding: "4px 8px", fontSize: "0.75rem", width: "auto" }}
                      >
                        <option value="public">Public</option>
                        <option value="internal">Internal</option>
                        <option value="restricted">Restricted (Admin Only)</option>
                      </select>
                    </td>
                    <td>
                      <span className={`badge ${col.is_approved ? "badge-success" : "badge-danger"}`}>
                        {col.is_approved ? "Approved" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                        onClick={() => handleUpdateColumnPolicy(col.id, { is_approved: !col.is_approved })}
                      >
                        {col.is_approved ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: USERS & ROLES */}
      {activeTab === "users" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem" }}>User Directory & Role-Based Access</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Manage team members, roles (ADMIN, MEMBER, AUDITOR), and account status.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowUserModal(true)}>
              + Invite / Create User
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === "ADMIN" ? "badge-danger" : u.role === "AUDITOR" ? "badge-warning" : "badge-primary"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-success" : "badge-neutral"}`}>
                        {u.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                        onClick={() => handleToggleUserActive(u)}
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* User Create Modal */}
          {showUserModal && (
            <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginBottom: "16px" }}>Create New User</h3>
                <form onSubmit={handleCreateUser} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Full Name</label>
                    <input
                      type="text"
                      className="input-field"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Email Address</label>
                    <input
                      type="email"
                      className="input-field"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Temporary Password</label>
                    <input
                      type="password"
                      className="input-field"
                      required
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Role</label>
                    <select
                      className="input-field"
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    >
                      <option value="MEMBER">MEMBER (Standard Workspace Access)</option>
                      <option value="AUDITOR">AUDITOR (Read-only Admin & Audit Access)</option>
                      <option value="ADMIN">ADMIN (Full Permissions)</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
                    <button type="button" className="btn btn-outline" onClick={() => setShowUserModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Create User
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: AUDIT LOGS & METRICS */}
      {activeTab === "audit" && (
        <div>
          <div className="glass-panel" style={{ padding: "18px", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "6px" }}>System Audit Trail</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Structured audit records for authentication, query validation, ClickHouse executions, and exports with sanitized credentials.
            </p>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(evt.created_at).toLocaleString()}
                    </td>
                    <td><span className="badge badge-primary">{evt.action}</span></td>
                    <td><code>{evt.resource}</code></td>
                    <td>
                      <span className={`badge ${evt.status === "SUCCESS" ? "badge-success" : "badge-danger"}`}>
                        {evt.status}
                      </span>
                    </td>
                    <td>{evt.duration_ms} ms</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-dim)", maxWidth: "300px" }}>
                      {evt.details ? JSON.stringify(evt.details) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
