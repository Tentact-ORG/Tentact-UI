/**
 * The prospect data model behind the workspace's search. Enumerations mirror
 * the attributes The Tentact sells on the landing page (seniority, signals,
 * verified contact details, firmographics) so filters and marketing agree.
 */

export const SENIORITIES = ["C-level", "VP", "Director", "Manager", "Individual contributor"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const DEPARTMENTS = ["Marketing", "Sales", "Engineering", "Product", "Operations", "Finance", "People", "Executive"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const EMPLOYEE_BANDS = ["1–10", "11–50", "51–200", "201–500", "501–1,000", "1,001–5,000", "5,000+"] as const;
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

export const REVENUE_BANDS = ["Under $1M", "$1M–$10M", "$10M–$50M", "$50M–$250M", "$250M+"] as const;
export type RevenueBand = (typeof REVENUE_BANDS)[number];

export const FUNDING_STAGES = ["Bootstrapped", "Seed", "Series A", "Series B", "Series C+", "Public"] as const;
export type FundingStage = (typeof FUNDING_STAGES)[number];

export const INTENT_LEVELS = ["High", "Medium", "Low"] as const;
export type IntentLevel = (typeof INTENT_LEVELS)[number];

export const HIRING_SIGNALS = ["Hiring sales", "Hiring marketing", "Hiring engineering", "Not hiring"] as const;
export type HiringSignal = (typeof HIRING_SIGNALS)[number];

/** Where a record was found; matches the sources shown on the landing page's reach map. */
export const PROSPECT_SOURCES = ["LinkedIn", "Google Maps", "Job boards", "News"] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const JOB_CHANGE_WINDOWS = [
  { value: "any", label: "Any time", days: null },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "180", label: "Last 6 months", days: 180 },
] as const;
export type JobChangeWindow = (typeof JOB_CHANGE_WINDOWS)[number]["value"];

export interface ProspectCompany {
  name: string;
  industry: string;
  employees: EmployeeBand;
  revenue: RevenueBand;
  /** Country of the headquarters. */
  headquarters: string;
  technologies: string[];
  hiring: HiringSignal[];
  funding: FundingStage;
  intent: IntentLevel;
}

export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  seniority: Seniority;
  department: Department;
  jobFunction: string;
  city: string;
  country: string;
  verifiedEmail: boolean;
  directDial: boolean;
  /** Days since the person started their current role, or `null` when longer than a year ago. */
  jobChangeDays: number | null;
  sources: ProspectSource[];
  company: ProspectCompany;
}

export interface ProspectFilters {
  query: string;
  // People
  titles: string[];
  seniorities: Seniority[];
  departments: Department[];
  functions: string[];
  countries: string[];
  verifiedEmail: boolean;
  directDial: boolean;
  jobChange: JobChangeWindow;
  sources: ProspectSource[];
  // Company
  companies: string[];
  industries: string[];
  employees: EmployeeBand[];
  revenue: RevenueBand[];
  headquarters: string[];
  technologies: string[];
  hiring: HiringSignal[];
  funding: FundingStage[];
  intent: IntentLevel[];
}

/** Keys of the list-valued filters. */
export type MultiFilterKey = {
  [K in keyof ProspectFilters]: ProspectFilters[K] extends string[] ? K : never;
}[keyof ProspectFilters];

export type ToggleFilterKey = "verifiedEmail" | "directDial";

export const EMPTY_FILTERS: ProspectFilters = {
  query: "",
  titles: [],
  seniorities: [],
  departments: [],
  functions: [],
  countries: [],
  verifiedEmail: false,
  directDial: false,
  jobChange: "any",
  sources: [],
  companies: [],
  industries: [],
  employees: [],
  revenue: [],
  headquarters: [],
  technologies: [],
  hiring: [],
  funding: [],
  intent: [],
};

/** What an export (and a future enrichment job) should include. */
export interface EnrichmentOptions {
  verifiedEmail: boolean;
  directDial: boolean;
  missingContactDetails: boolean;
  companyFirmographics: boolean;
  technologies: boolean;
  signals: boolean;
}

export const DEFAULT_ENRICHMENT: EnrichmentOptions = {
  verifiedEmail: true,
  directDial: true,
  missingContactDetails: true,
  companyFirmographics: true,
  technologies: false,
  signals: false,
};

export interface SavedSearch {
  id: string;
  name: string;
  /** ISO timestamp. */
  createdAt: string;
  filters: ProspectFilters;
}

export interface ProspectList {
  id: string;
  name: string;
  /** ISO timestamp. */
  createdAt: string;
  prospectIds: string[];
}
