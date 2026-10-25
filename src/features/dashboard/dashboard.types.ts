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

/** Display name derived from a work email, e.g. `maya.rao@…` → `Maya`. */
export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there";
}

export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0].charAt(0) + parts[1].charAt(0) : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}
