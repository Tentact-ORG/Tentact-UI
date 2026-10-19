import "server-only";
import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { MARKET_SPOTS, PRIMARY_ROUTE, SECONDARY_ROUTES } from "./reach.data";
import type { MapGround, ReachMapModel, ScreenPoint } from "./reach.types";

/** Projection canvas. The SVG crops the bottom (Antarctica's latitude band) via a shorter viewBox. */
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
const MAP_VIEW_HEIGHT = 440;

/** ISO 3166 numeric code for Antarctica, which is left off the map. */
const ANTARCTICA_ID = "010";

type CountriesTopology = Topology<{ countries: GeometryCollection }>;

function createProjection(): GeoProjection {
  return geoNaturalEarth1().fitExtent(
    [
      [10, 10],
      [MAP_WIDTH - 10, MAP_HEIGHT - 10],
    ],
    { type: "Sphere" },
  );
}

function projectPoint(projection: GeoProjection, coordinates: [number, number]): ScreenPoint {
  const point = projection(coordinates);
  if (!point) throw new Error(`Cannot project coordinates ${coordinates.join(",")}`);
  return point;
}

function quadraticArc([x1, y1]: ScreenPoint, [x2, y2]: ScreenPoint, lift: number): string {
  return `M${x1},${y1} Q${(x1 + x2) / 2},${Math.min(y1, y2) - lift} ${x2},${y2}`;
}

function buildCountryOutlines(projection: GeoProjection): string[] {
  const topology = countries110m as unknown as CountriesTopology;
  const collection = feature(topology, topology.objects.countries);
  const toPath = geoPath(projection).digits(1);

  return collection.features
    .filter((country) => country.id !== ANTARCTICA_ID)
    .map((country) => toPath(country))
    .filter((path): path is string => Boolean(path));
}

/** A plain dot grid, used if the atlas can't be read for any reason. */
function buildDotGrid(): ScreenPoint[] {
  const dots: ScreenPoint[] = [];
  for (let x = 20; x < MAP_WIDTH; x += 14) {
    for (let y = 20; y < MAP_HEIGHT; y += 14) dots.push([x, y]);
  }
  return dots;
}

function buildGround(projection: GeoProjection): MapGround {
  try {
    return { kind: "countries", paths: buildCountryOutlines(projection) };
  } catch (error) {
    console.error("Reach map: falling back to a dot grid", error);
    return { kind: "dots", dots: buildDotGrid() };
  }
}

/**
 * Builds everything the reach map needs to render, on the server: country
 * outlines, pin positions and route curves. The browser receives finished SVG
 * data instead of downloading the atlas and a projection library.
 */
export function buildReachMapModel(): ReachMapModel {
  const projection = createProjection();
  const points = MARKET_SPOTS.map((spot) => projectPoint(projection, spot.coordinates));

  const primaryRoutes = PRIMARY_ROUTE.slice(0, -1).map((fromIndex, leg) => {
    const from = points[fromIndex];
    const to = points[PRIMARY_ROUTE[leg + 1]];
    // Longer legs arc higher.
    return quadraticArc(from, to, Math.abs(to[0] - from[0]) * 0.22 + 30);
  });

  const secondaryRoutes = SECONDARY_ROUTES.map(([from, to]) => quadraticArc(points[from], points[to], 40));

  return {
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_VIEW_HEIGHT}`,
    ground: buildGround(projection),
    pins: MARKET_SPOTS.map((spot, index) => ({
      ...spot,
      left: `${(points[index][0] / MAP_WIDTH) * 100}%`,
      top: `${(points[index][1] / MAP_VIEW_HEIGHT) * 100}%`,
    })),
    primaryRoutes,
    secondaryRoutes,
  };
}
