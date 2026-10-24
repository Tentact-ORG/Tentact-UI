import { buildSalesMailto } from "@/config/site";
import { formatThousands } from "@/lib/math";

/**
 * Credit packs offered on /credits.
 *
 * IMPORTANT: these amounts and prices are placeholders chosen to make the page
 * usable. They are not published anywhere else on the site; confirm them with
 * sales before going live. Edit them here only — the page and the top-up
 * request derive everything from this list.
 */
export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  /** Price in US dollars, before tax. */
  priceUsd: number;
  description: string;
  highlight?: boolean;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "starter", name: "Starter", credits: 1_000, priceUsd: 99, description: "For testing a new segment or a single campaign." },
  { id: "growth", name: "Growth", credits: 5_000, priceUsd: 399, description: "For a team prospecting every week.", highlight: true },
  { id: "scale", name: "Scale", credits: 20_000, priceUsd: 1_299, description: "For agencies and outbound teams at volume." },
];

/** Bounds for a custom top-up, in credits. */
export const CUSTOM_CREDITS = { min: 500, max: 1_000_000, step: 500 } as const;

/** What a credit buys. Shown on the page so the unit is never ambiguous. */
export const CREDIT_USES: readonly { action: string; cost: string }[] = [
  { action: "Export a verified contact (email checked before delivery)", cost: "1 credit" },
  { action: "Reveal a direct dial", cost: "1 credit" },
  { action: "Enrich an existing record you upload", cost: "1 credit" },
];

export function formatUsd(amount: number): string {
  return `$${formatThousands(amount)}`;
}

export function pricePerCredit(pack: CreditPack): string {
  return `$${(pack.priceUsd / pack.credits).toFixed(3)}`;
}

export interface TopUpRequest {
  credits: number;
  /** Present for a listed pack; a custom amount is quoted by sales. */
  pack?: CreditPack;
  workspaceName: string;
  email: string;
}

/**
 * There is no payment backend yet, so a top-up is a pre-filled request to
 * sales, consistent with every other purchase action on the site. Replace this
 * with a checkout session when billing is connected.
 */
export function buildTopUpMailto({ credits, pack, workspaceName, email }: TopUpRequest): string {
  const subject = `Credit top-up: ${formatThousands(credits)} credits for ${workspaceName}`;
  const lines = [
    `Workspace: ${workspaceName}`,
    `Account: ${email}`,
    `Credits: ${formatThousands(credits)}`,
    pack ? `Pack: ${pack.name} (${formatUsd(pack.priceUsd)} before tax)` : "Pack: custom amount, please send a quote",
    "",
    "Please send an invoice or payment link.",
  ];
  return `${buildSalesMailto(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
