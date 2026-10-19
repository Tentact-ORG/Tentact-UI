import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./RingSection.module.css";

export type RingCardTone = "plain" | "red" | "yellow" | "ink" | "lime";

interface RingCardBase {
  id: string;
  width: number;
  height: number;
}

export interface RingPhotoCard extends RingCardBase {
  kind: "photo";
  src: string;
  label: string;
}

export interface RingDataCard extends RingCardBase {
  kind: "data";
  tone: RingCardTone;
  label: string;
  body: ReactNode;
  footer?: ReactNode;
}

export type RingCard = RingPhotoCard | RingDataCard;

/** Cards orbiting the "Describe the list" headline: buyers, signals and outputs. */
export const RING_CARDS: readonly RingCard[] = [
  { id: "founder", kind: "photo", src: "/assets/people/glasses.jpg", label: "Founder · Lisbon", width: 160, height: 190 },
  {
    id: "lead",
    kind: "data",
    tone: "plain",
    label: "Lead",
    width: 170,
    height: 120,
    body: (
      <div>
        <div className={styles.value}>Maya Rao</div>
        <div className={styles.subtle}>VP Marketing</div>
      </div>
    ),
    footer: <span className={styles.ok}>✓ verified email</span>,
  },
  {
    id: "database",
    kind: "data",
    tone: "red",
    label: "Database",
    width: 150,
    height: 130,
    body: <div className={cx(styles.value, styles.valueLarge)}>420M+</div>,
    footer: <span>verified data</span>,
  },
  {
    id: "signal",
    kind: "data",
    tone: "yellow",
    label: "Signal",
    width: 140,
    height: 130,
    body: (
      <div className={styles.value}>
        New role
        <br />· 32 days
      </div>
    ),
    footer: <span className={styles.note}>Head of Growth</span>,
  },
  {
    id: "icp",
    kind: "data",
    tone: "ink",
    label: "ICP match",
    width: 170,
    height: 120,
    body: (
      <div className={styles.value}>
        SaaS · 50–500
        <br />
        VP &amp; above
      </div>
    ),
    footer: <span className={cx(styles.note, styles.noteMuted)}>fits your profile</span>,
  },
  {
    id: "intent",
    kind: "data",
    tone: "lime",
    label: "Intent",
    width: 130,
    height: 140,
    body: (
      <div className={styles.bars}>
        {[30, 45, 38, 62, 100].map((height) => (
          <i key={height} style={{ height: `${height}%` }} />
        ))}
      </div>
    ),
    footer: <div className={styles.value}>High</div>,
  },
  { id: "marketer", kind: "photo", src: "/assets/people/camera.jpg", label: "Marketer · Madrid", width: 150, height: 200 },
  {
    id: "prompt",
    kind: "data",
    tone: "plain",
    label: "Prompt",
    width: 180,
    height: 120,
    body: <div className={cx(styles.value, styles.valueSerif)}>“CMOs who switched jobs this quarter”</div>,
  },
  {
    id: "dial",
    kind: "data",
    tone: "plain",
    label: "Direct dial",
    width: 160,
    height: 110,
    body: <div className={styles.value}>+1 415 ••• 018</div>,
    footer: <span className={styles.ok}>✓ valid phone</span>,
  },
  {
    id: "export",
    kind: "data",
    tone: "ink",
    label: "Export",
    width: 170,
    height: 110,
    body: <div className={styles.value}>↓ buyers.csv</div>,
    footer: <span className={cx(styles.note, styles.noteMuted)}>1,240 rows · verified</span>,
  },
  {
    id: "hiring",
    kind: "data",
    tone: "yellow",
    label: "Hiring",
    width: 130,
    height: 120,
    body: (
      <div className={styles.value}>
        4 SDRs
        <br />
        this month
      </div>
    ),
  },
  {
    id: "verified",
    kind: "data",
    tone: "red",
    label: "Verified",
    width: 140,
    height: 120,
    body: (
      <div className={styles.value}>
        Email ✓<br />
        Phone ✓
      </div>
    ),
    footer: <span>before delivery</span>,
  },
];

/** Prompts typed out, one after another, under the headline. */
export const TYPED_PROMPTS: readonly string[] = [
  "CMOs who switched jobs this quarter",
  "Founders hiring their first sales rep",
  "Dental clinics in Austin with 4.5★ and up",
  "People who commented on a RevOps post",
  "Engineers with AI patents and 5k+ followers",
];

export const PILL_AVATARS: readonly { initials: string; color: string }[] = [
  { initials: "MR", color: "#c7d2fe" },
  { initials: "DR", color: "#fde68a" },
  { initials: "EP", color: "#fecaca" },
];

export const RING_CORNERS = {
  topLeft: "Leads_2026",
  topRight: "Verified",
  bottomLeft: "Exclusive data",
  bottomRight: "Your list",
} as const;
