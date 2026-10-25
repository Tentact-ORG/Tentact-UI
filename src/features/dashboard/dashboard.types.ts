export interface WorkspaceSummary {
  name: string;
}

export interface DashboardUser {
  email: string;
  /** ADMIN, AUDITOR or MEMBER. */
  role: string;
}

/** Administrators and auditors can open the admin console. */
export function canOpenAdminConsole(role: string): boolean {
  return role === "ADMIN" || role === "AUDITOR";
}

export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0].charAt(0) + parts[1].charAt(0) : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}
