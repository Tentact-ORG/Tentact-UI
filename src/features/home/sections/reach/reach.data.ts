export type SourceKey = "li" | "gm" | "jb" | "nw";
export type SourceFilter = SourceKey | "all";

export interface DataSource {
  key: SourceKey;
  label: string;
  color: string;
}

export const DATA_SOURCES: Record<SourceKey, DataSource> = {
  li: { key: "li", label: "LinkedIn", color: "#3b82f6" },
  gm: { key: "gm", label: "Google Maps", color: "#ff4a1c" },
  jb: { key: "jb", label: "Job boards", color: "#10b981" },
  nw: { key: "nw", label: "News", color: "#9ca3af" },
};

/** Legend order. */
export const SOURCE_FILTER_ORDER: readonly SourceKey[] = ["li", "gm", "jb", "nw"];

export interface MarketSpot {
  city: string;
  /** [longitude, latitude] */
  coordinates: [number, number];
  buyers: number;
  source: SourceKey;
  /** Place the label above the pin instead of below it. */
  labelAbove?: boolean;
}

/** One ICP search, traced live across markets. */
export const MARKET_SPOTS: readonly MarketSpot[] = [
  { city: "San Francisco", coordinates: [-122.4, 37.8], buyers: 2184, source: "li" },
  { city: "São Paulo", coordinates: [-46.6, -23.5], buyers: 642, source: "jb" },
  { city: "London", coordinates: [-0.1, 51.5], buyers: 1207, source: "nw" },
  { city: "Bengaluru", coordinates: [77.6, 12.97], buyers: 1936, source: "li" },
  { city: "Singapore", coordinates: [103.8, 1.35], buyers: 418, source: "gm" },
  { city: "Sydney", coordinates: [151.2, -33.9], buyers: 533, source: "gm" },
  { city: "Dubai", coordinates: [55.3, 25.2], buyers: 296, source: "jb", labelAbove: true },
];

/** The animated route, as indexes into MARKET_SPOTS: SF → London → Bengaluru → Sydney → São Paulo → SF. */
export const PRIMARY_ROUTE: readonly number[] = [0, 2, 3, 5, 1, 0];

/** Fainter, static side routes. */
export const SECONDARY_ROUTES: readonly [number, number][] = [
  [3, 4],
  [2, 6],
];
