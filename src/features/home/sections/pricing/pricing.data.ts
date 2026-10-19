import { buildSalesMailto } from "@/config/site";

export const PRICING = {
  basePrice: 4000,
  festivePrice: 3500,
  /** The sealed "insider" discount, applied on top of the festive price. */
  insiderDiscountRate: 0.1,
} as const;

export const INSIDER_PRICE = Math.round(PRICING.festivePrice * (1 - PRICING.insiderDiscountRate));
export const FESTIVE_SAVING = PRICING.basePrice - PRICING.festivePrice;
export const TOTAL_SAVING = PRICING.basePrice - INSIDER_PRICE;

export const OFFER_CTA = {
  sealed: {
    label: "Apply for the offer",
    href: buildSalesMailto("The Tentact — Dasara Diwali offer"),
  },
  revealed: {
    label: `Claim my $${INSIDER_PRICE.toLocaleString("en-US")} price`,
    href: buildSalesMailto(
      `The Tentact — Festive offer + insider discount ($${INSIDER_PRICE.toLocaleString("en-US")})`,
    ),
  },
} as const;

export const INCLUDED_FEATURES: readonly string[] = [
  "Access to 420+ million verified data",
  "Verified emails & direct dials",
  "ICP-based targeting",
  "Job-change, hiring & intent signals",
  "Export to CSV or your CRM",
  "A real human on our sales team",
];

/** Twinkling sparkles in the offer card (position + animation delay). */
export const SPARKLES: readonly { left: string; top: string; delay: string }[] = [
  { left: "12%", top: "18%", delay: "0s" },
  { left: "62%", top: "10%", delay: ".6s" },
  { left: "84%", top: "46%", delay: "1.2s" },
  { left: "40%", top: "88%", delay: "1.8s" },
];
