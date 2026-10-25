/**
 * The prospect data model behind the workspace's search. Prospects come from
 * the lead warehouse through `/api/search`; attribute values (seniority,
 * function, employee band…) use the warehouse's own vocabularies, and filter
 * options are discovered from it rather than fixed here.
 */

export const JOB_CHANGE_WINDOWS = [
  { value: "any", label: "Any time", days: null },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "180", label: "Last 6 months", days: 180 },
] as const;
export type JobChangeWindow = (typeof JOB_CHANGE_WINDOWS)[number]["value"];

export interface ProspectCompany {
  /** Warehouse company id (RBID_ORG). */
  id: string | null;
  name: string;
  industry: string;
  employees: string;
  revenue: string;
  /** Country of the headquarters. */
  headquarters: string;
  website: string | null;
  technologies: string[];
  hiring: string[];
  funding: string;
  /** Buying-intent level; null when the data source has no intent signal. */
  intent: string | null;
}

export interface Prospect {
  /** Warehouse person id (RBID_PER). */
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  seniority: string;
  department: string;
  jobFunction: string;
  city: string;
  country: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  verifiedEmail: boolean;
  directDial: boolean;
  /** Days since the person started their current role, or `null` when unknown. */
  jobChangeDays: number | null;
  sources: string[];
  company: ProspectCompany;
}

export interface ProspectFilters {
  query: string;
  // People
  titles: string[];
  seniorities: string[];
  departments: string[];
  functions: string[];
  countries: string[];
  verifiedEmail: boolean;
  directDial: boolean;
  jobChange: JobChangeWindow;
  sources: string[];
  // Company
  companies: string[];
  industries: string[];
  employees: string[];
  revenue: string[];
  headquarters: string[];
  technologies: string[];
  hiring: string[];
  funding: string[];
  intent: string[];
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

/** What an export should include. */
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
  /** Snapshot of the prospects when the list was saved. */
  prospects: Prospect[];
}
