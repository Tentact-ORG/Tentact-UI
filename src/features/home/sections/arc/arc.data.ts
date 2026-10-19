export interface ArcCard {
  image: string;
  /** Background of the info chip (translucent so the photo shows through a little). */
  chipColor: string;
  /** Text colour for chips on dark backgrounds. */
  chipInk?: string;
  label: string;
  value: string;
}

/** The fields every delivered lead comes with, shown as cards sweeping along an arc. */
export const ARC_CARDS: readonly ArcCard[] = [
  { image: "/assets/arc/email.jpg", chipColor: "rgba(214,242,226,.94)", label: "✉ Email", value: "maya@northwind.io" },
  { image: "/assets/arc/phone.jpg", chipColor: "rgba(219,231,255,.94)", label: "☏ Phone", value: "+1 415 ••• 018" },
  { image: "/assets/people/spotlight.jpg", chipColor: "rgba(255,255,255,.94)", label: "◉ Seniority", value: "Decision maker" },
  { image: "/assets/arc/title.jpg", chipColor: "rgba(236,226,205,.95)", label: "◐ Title", value: "VP Marketing" },
  { image: "/assets/arc/company.jpg", chipColor: "rgba(231,221,251,.94)", label: "▦ Company", value: "Northwind Cloud" },
  { image: "/assets/arc/intent.jpg", chipColor: "rgba(255,74,28,.95)", chipInk: "#fff", label: "↗ Intent", value: "High · attribution" },
  { image: "/assets/arc/funding.jpg", chipColor: "rgba(255,224,207,.95)", label: "$ Funding", value: "Series B · $40M" },
  { image: "/assets/arc/icp.jpg", chipColor: "rgba(214,242,226,.94)", label: "◎ ICP fit", value: "Matched to you" },
  { image: "/assets/arc/tech.jpg", chipColor: "rgba(233,246,191,.95)", label: "⌘ Tech", value: "HubSpot · Segment" },
  { image: "/assets/arc/newrole.jpg", chipColor: "rgba(14,14,15,.9)", chipInk: "#fff", label: "● New role", value: "32 days ago" },
  { image: "/assets/arc/location.jpg", chipColor: "rgba(255,217,230,.95)", label: "⌖ Location", value: "San Francisco" },
  { image: "/assets/arc/hiring.jpg", chipColor: "rgba(255,240,122,.95)", label: "+ Hiring", value: "4 SDRs this month" },
];

export const ARC_FEATURES: readonly { title: string; description: string }[] = [
  { title: "420M+ data", description: "A database built for scale." },
  { title: "Verified data", description: "Emails and phones checked first." },
  { title: "ICP-based", description: "Only the buyers who fit your profile." },
];
