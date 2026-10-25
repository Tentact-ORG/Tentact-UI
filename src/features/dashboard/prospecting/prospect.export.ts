import { fullName } from "./prospect.matching";
import type { EnrichmentOptions, Prospect } from "./prospect.types";

interface CsvColumn {
  header: string;
  value: (prospect: Prospect) => string | number | boolean;
}

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

const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** Columns follow the enrichment options, so the export matches what the visitor asked for. */
export function buildCsvColumns(options: EnrichmentOptions): CsvColumn[] {
  const columns: CsvColumn[] = [
    { header: "Name", value: fullName },
    { header: "Title", value: (p) => p.title },
    { header: "Seniority", value: (p) => p.seniority },
    { header: "Department", value: (p) => p.department },
    { header: "Company", value: (p) => p.company.name },
    { header: "City", value: (p) => p.city },
    { header: "Country", value: (p) => p.country },
  ];

  if (options.verifiedEmail) {
    columns.push({ header: "Email", value: (p) => p.email ?? "" }, { header: "Verified email", value: (p) => yesNo(p.verifiedEmail) });
  }
  if (options.directDial) columns.push({ header: "Phone", value: (p) => p.phone ?? "" });
  if (options.missingContactDetails) {
    columns.push({ header: "Persona", value: (p) => p.jobFunction }, { header: "LinkedIn", value: (p) => p.linkedinUrl ?? "" });
  }
  if (options.companyFirmographics) {
    columns.push(
      { header: "Industry", value: (p) => p.company.industry },
      { header: "Employees", value: (p) => p.company.employees },
      { header: "Revenue", value: (p) => p.company.revenue },
      { header: "Headquarters", value: (p) => p.company.headquarters },
      { header: "Website", value: (p) => p.company.website ?? "" },
    );
  }
  if (options.technologies) columns.push({ header: "Technologies", value: (p) => p.company.technologies.join("; ") });
  if (options.signals) {
    columns.push(
      { header: "Hiring", value: (p) => p.company.hiring.join("; ") },
      { header: "Funding", value: (p) => p.company.funding },
      { header: "Days in role", value: (p) => (p.jobChangeDays === null ? "" : p.jobChangeDays) },
    );
  }
  columns.push({ header: "Sources", value: (p) => p.sources.join("; ") });
  return columns;
}

export function buildCsv(prospects: readonly Prospect[], options: EnrichmentOptions): string {
  const columns = buildCsvColumns(options);
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const rows = prospects.map((prospect) => columns.map((column) => csvCell(column.value(prospect))).join(","));
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
