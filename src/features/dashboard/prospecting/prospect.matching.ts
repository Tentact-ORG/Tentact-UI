import type { Prospect } from "./prospect.types";

export function fullName(prospect: Prospect): string {
  return `${prospect.firstName} ${prospect.lastName}`.trim() || "Unnamed contact";
}

export function initials(prospect: Prospect): string {
  const letters = `${prospect.firstName.charAt(0)}${prospect.lastName.charAt(0)}`.toUpperCase();
  return letters || "?";
}

export interface ProspectSummary {
  total: number;
  verifiedEmail: number;
  directDial: number;
  /** Started a new role within the last 90 days. */
  recentJobChanges: number;
  /** Works at a company with open roles. */
  hiring: number;
}

export function summariseProspects(prospects: readonly Prospect[]): ProspectSummary {
  return prospects.reduce<ProspectSummary>(
    (summary, prospect) => ({
      total: summary.total + 1,
      verifiedEmail: summary.verifiedEmail + (prospect.verifiedEmail ? 1 : 0),
      directDial: summary.directDial + (prospect.directDial ? 1 : 0),
      recentJobChanges: summary.recentJobChanges + (prospect.jobChangeDays !== null && prospect.jobChangeDays <= 90 ? 1 : 0),
      hiring: summary.hiring + (prospect.company.hiring.length > 0 ? 1 : 0),
    }),
    { total: 0, verifiedEmail: 0, directDial: 0, recentJobChanges: 0, hiring: 0 },
  );
}

export function percentage(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
