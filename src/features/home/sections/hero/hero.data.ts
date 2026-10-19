export interface HeroBuyer {
  initials: string;
  name: string;
  role: string;
  avatarColor: string;
  /** Card anchor as a percentage of the hero's width / height. */
  x: number;
  y: number;
  /** Whether the card stays visible on small screens. */
  keepOnMobile: boolean;
}

/** Buyer cards the globe's tentacles reach out to. */
export const HERO_BUYERS: readonly HeroBuyer[] = [
  { initials: "JW", name: "Jonas Weber", role: "Engineer · Berlin", avatarColor: "#c7d2fe", x: 12, y: 58, keepOnMobile: true },
  { initials: "LO", name: "Lucía Ortega", role: "Marketer · Madrid", avatarColor: "#fde68a", x: 15, y: 80, keepOnMobile: false },
  { initials: "AB", name: "Ava Brooks", role: "Creator · New York", avatarColor: "#fecaca", x: 87, y: 56, keepOnMobile: true },
  { initials: "RI", name: "Rohan Iyer", role: "Agency lead · Bengaluru", avatarColor: "#bbf7d0", x: 84, y: 79, keepOnMobile: false },
];

/** Example searches cycled through in the hero's bottom-left slider. */
export const EXAMPLE_QUERIES: readonly string[] = [
  "CMOs who joined a new company last quarter",
  "AI researchers with patents and 5,000+ followers",
  "Everyone who engaged with a LinkedIn post on RevOps",
  "Founders posting about go-to-market",
  "Dental clinics in Austin rated 4.5★+ that are hiring",
];

/** Location pins on the globe, as percentages of the globe's box. */
export const GLOBE_PINS: readonly { left: number; top: number }[] = [
  { left: 24, top: 34 },
  { left: 76, top: 31 },
  { left: 33, top: 42 },
  { left: 68, top: 43 },
];

export interface OrbitRing {
  tilt: number;
  radiusX: number;
  radiusY: number;
}

/** The two dotted orbits drawn around the globe (viewBox units, 0–100). */
export const ORBIT_RINGS: readonly [OrbitRing, OrbitRing] = [
  { tilt: -18, radiusX: 64, radiusY: 15 },
  { tilt: 22, radiusX: 60, radiusY: 12 },
];

export const SATELLITE_COUNT = 7;

export type CloudDepth = "back" | "front";

export interface HeroCloud {
  id: string;
  src: string;
  width: number;
  height: number;
  depth: CloudDepth;
  /** Horizontal direction the cloud parts towards on scroll: -1 left, 1 right, 0 sinks down. */
  direction: -1 | 0 | 1;
  /** Pointer parallax strength in pixels. */
  parallax: number;
}

const CLOUD_A = { src: "/assets/cloud-a.png", width: 1000, height: 527 };
const CLOUD_B = { src: "/assets/cloud-b.png", width: 1000, height: 356 };

/** Rendered in this order; the front layer sits above the globe. */
export const HERO_CLOUDS: readonly HeroCloud[] = [
  { id: "back1", ...CLOUD_B, depth: "back", direction: -1, parallax: 8 },
  { id: "back2", ...CLOUD_A, depth: "back", direction: 1, parallax: 10 },
  { id: "front1", ...CLOUD_A, depth: "front", direction: -1, parallax: 26 },
  { id: "front3", ...CLOUD_B, depth: "front", direction: 0, parallax: 22 },
  { id: "front2", ...CLOUD_B, depth: "front", direction: 1, parallax: 30 },
];
