import { buildSalesMailto, ROUTES } from "@/config/site";

export interface NavLink {
  label: string;
  href: string;
}

/** Entries of the dropdown menu, in page order. */
export const MENU_LINKS: readonly NavLink[] = [
  { label: "Why us", href: "#real" },
  { label: "How it works", href: "#how" },
  { label: "What you get", href: "#data" },
  { label: "Who's inside", href: "#who" },
  { label: "Reach", href: "#reach" },
  { label: "Festive offer", href: "#pricing" },
  { label: "Get started", href: "#start" },
];

export const FOOTER_PRIMARY_LINKS: readonly NavLink[] = [
  { label: "How it works", href: "#how" },
  { label: "What you get", href: "#data" },
  { label: "Who's inside", href: "#who" },
  { label: "Pricing", href: "#pricing" },
  { label: "Contact", href: buildSalesMailto() },
];

export const FOOTER_LEGAL_LINKS: readonly NavLink[] = [
  { label: "Terms", href: ROUTES.terms },
  { label: "Privacy", href: ROUTES.privacy },
];
