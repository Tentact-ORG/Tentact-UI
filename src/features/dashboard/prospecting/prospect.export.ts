import { resolveExportFields } from "@/lib/exportFields";
import { fullName } from "./prospect.matching";
import type { Prospect } from "./prospect.types";

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);

/**
 * Quotes a CSV cell and neutralises spreadsheet formula injection: values that
 * start with =, +, -, @, tab or carriage return get a leading single quote,
 * matching the server-side export.
 */
function csvCell(value: string | number | boolean): string {
  let text = String(value);
  if (text.length > 0 && FORMULA_PREFIXES.has(text[0])) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** How each export field reads from a prospect on screen (the client-side twin of the server's column mapping). */
const PROSPECT_FIELD_VALUES: Record<string, (p: Prospect) => string> = {
  first_name: (p) => p.firstName,
  last_name: (p) => p.lastName,
  full_name: fullName,
  job_title: (p) => p.title,
  seniority: (p) => p.seniority,
  department: (p) => p.department,
  persona: (p) => p.jobFunction,
  city: (p) => p.city,
  country: (p) => p.country,
  linkedin_url: (p) => p.linkedinUrl ?? "",
  email: (p) => p.email ?? "",
  email_status: (p) => (p.verifiedEmail ? "VALID" : ""),
  phone: (p) => p.phone ?? "",
  company: (p) => p.company.name,
  website: (p) => p.company.website ?? "",
  industry: (p) => p.company.industry,
  employees: (p) => p.company.employees,
  revenue: (p) => p.company.revenue,
  headquarters: (p) => p.company.headquarters,
  funding: (p) => p.company.funding,
  contact_id: (p) => p.id,
  company_id: (p) => p.company.id ?? "",
  technologies: (p) => p.company.technologies.join("; "),
  hiring: (p) => (p.company.hiring.length > 0 ? "Yes" : "No"),
};

/** A CSV of exactly the chosen export fields, headed by their labels. */
export function buildFieldCsv(prospects: readonly Prospect[], fieldKeys: readonly string[]): string {
  const fields = resolveExportFields(fieldKeys);
  const header = fields.map((field) => csvCell(field.label)).join(",");
  const rows = prospects.map((prospect) => fields.map((field) => csvCell(PROSPECT_FIELD_VALUES[field.key]?.(prospect) ?? "")).join(","));
  return [header, ...rows].join("\r\n");
}

/** Triggers a browser download of a text file. */
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** A filesystem-safe name such as `tentact-vp-marketing-2026-10-24.csv`. */
export function exportFilename(label: string): string {
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `tentact-${safe || "prospects"}-${date}.csv`;
}
