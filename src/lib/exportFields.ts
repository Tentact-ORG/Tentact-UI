/**
 * The fields a user can choose to export, shared by the server-side export
 * (which reads them from query result columns) and the dashboard (checklist and
 * client-side CSVs). Each field lists the result columns that can supply it, in
 * order of preference; a row takes the first non-empty one. The SQL generator
 * chooses the selected columns, so several names are known per field (the
 * growstack warehouse's first, then the synthetic dataset's).
 */

export type ExportFieldGroup = "Person" | "Contact details" | "Company" | "Identifiers";

export interface ExportField {
  key: string;
  label: string;
  group: ExportFieldGroup;
  /** Candidate result columns, matched case-insensitively. */
  columns: readonly string[];
  /** Contact details cost credits to export. */
  contactDetail?: boolean;
  /** Ticked when the user hasn't chosen yet. */
  byDefault?: boolean;
}

export const EXPORT_FIELDS: readonly ExportField[] = [
  { key: "first_name", label: "First name", group: "Person", columns: ["FIRST_NAME_PER", "first_name"], byDefault: true },
  { key: "last_name", label: "Last name", group: "Person", columns: ["LAST_NAME_PER", "last_name"], byDefault: true },
  { key: "full_name", label: "Full name", group: "Person", columns: ["FULL_NAME_PER", "full_name", "name"] },
  { key: "job_title", label: "Job title", group: "Person", columns: ["JOB_TITLE_PER", "job_title", "title"], byDefault: true },
  { key: "seniority", label: "Seniority", group: "Person", columns: ["JOB_LEVEL_PER", "seniority_level", "seniority"] },
  { key: "department", label: "Department", group: "Person", columns: ["JOB_FUNCTION_PER", "department"] },
  { key: "persona", label: "Persona", group: "Person", columns: ["PERSONA_PER", "job_function"] },
  { key: "city", label: "City", group: "Person", columns: ["CITY_PER", "city"] },
  { key: "country", label: "Country", group: "Person", columns: ["COUNTRY_NAME_PER", "country"], byDefault: true },
  { key: "linkedin_url", label: "LinkedIn URL", group: "Contact details", columns: ["LINKEDIN_URL_PER", "linkedin_url"], byDefault: true },
  {
    key: "email",
    label: "Email",
    group: "Contact details",
    columns: ["EMAIL_ADDRESS_PER", "enriched_email_per", "enriched_email", "work_email", "email"],
    contactDetail: true,
    byDefault: true,
  },
  { key: "email_status", label: "Email status", group: "Contact details", columns: ["EMAIL_STATUS_PER", "enriched_email_verification_per", "is_verified"] },
  {
    key: "phone",
    label: "Phone",
    group: "Contact details",
    columns: ["CELLPHONE_PER", "enriched_phone", "DIRECT_PHONE_PER", "direct_phone", "phone"],
    contactDetail: true,
    byDefault: true,
  },
  { key: "company", label: "Company", group: "Company", columns: ["COMPANY_NAME_ORG", "company_name"], byDefault: true },
  { key: "website", label: "Website", group: "Company", columns: ["WEBSITE_ORG", "DOMAIN_ORG", "website", "domain"] },
  { key: "industry", label: "Industry", group: "Company", columns: ["INDUSTRY_LINKEDIN_ORG", "company_industry", "industry"] },
  { key: "employees", label: "Employees", group: "Company", columns: ["EMPLOYEE_COUNT_RANGE_ORG", "employee_count", "size_range"] },
  { key: "revenue", label: "Revenue", group: "Company", columns: ["REVENUE_RANGE_ORG", "revenue_range"] },
  { key: "headquarters", label: "Headquarters", group: "Company", columns: ["HEADQUARTERS_COUNTRY_NAME_ORG", "COUNTRY_NAME_ORG", "headquarters"] },
  { key: "funding", label: "Last funding", group: "Company", columns: ["LAST_FUNDING_TYPE_ORG", "funding_stage"] },
  { key: "contact_id", label: "Contact ID", group: "Identifiers", columns: ["contact_id", "RBID_PER"] },
  { key: "company_id", label: "Company ID", group: "Identifiers", columns: ["RBID_ORG", "company_id"] },
];

export const EXPORT_FIELD_GROUPS: readonly ExportFieldGroup[] = ["Person", "Contact details", "Company", "Identifiers"];

export const DEFAULT_EXPORT_FIELDS: readonly string[] = EXPORT_FIELDS.filter((field) => field.byDefault).map((field) => field.key);

const BY_KEY = new Map(EXPORT_FIELDS.map((field) => [field.key, field]));

/** The known fields among `keys`, in catalogue order. */
export function resolveExportFields(keys: readonly string[]): ExportField[] {
  const wanted = new Set(keys);
  return EXPORT_FIELDS.filter((field) => wanted.has(field.key) && BY_KEY.has(field.key));
}

/** Whether any chosen field is a paid contact detail. */
export function includesContactDetails(keys: readonly string[]): boolean {
  return resolveExportFields(keys).some((field) => field.contactDetail === true);
}
