import type { MarketSpot } from "./reach.data";

export type ScreenPoint = [number, number];

export type MapGround = { kind: "countries"; paths: string[] } | { kind: "dots"; dots: ScreenPoint[] };

export interface MapPinModel extends MarketSpot {
  /** Position as a percentage of the map box, ready for `left` / `top`. */
  left: string;
  top: string;
}

/** Serializable data handed from the server to the interactive map. */
export interface ReachMapModel {
  viewBox: string;
  ground: MapGround;
  pins: MapPinModel[];
  primaryRoutes: string[];
  secondaryRoutes: string[];
}
