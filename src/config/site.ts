/**
 * Site-wide constants. Anything that is repeated across pages (brand copy,
 * contact details, external links) lives here so it is changed in one place.
 */
export const SITE = {
  name: "The Tentact",
  tagline: "Sales data for people who sell",
  description:
    "The Tentact reaches across the live web to find the buyers you sell to — verified, complete and ready to work.",
  salesEmail: "sales@redmarten.com",
  demoUrl: "https://cal.com/tech-team-xz70kb/30minsdemo",
  copyrightYear: 2026,
} as const;

export const ROUTES = {
  home: "/",
  terms: "/terms",
  privacy: "/terms#privacy",
  pricing: "/#pricing",
} as const;

/** Builds a `mailto:` link to the sales inbox, optionally with a subject line. */
export function buildSalesMailto(subject?: string): string {
  const base = `mailto:${SITE.salesEmail}`;
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base;
}
