import { readFileSync } from "node:fs";
import path from "node:path";
import { pointInGeometry } from "./point-in-polygon";

/**
 * Census TIGER/Line block-group boundaries for Lumpkin County and the four
 * adjacent counties (Dawson, White, Union, Hall) — fetched from the
 * TIGERweb REST API (tigerWMS_Current, layer 10, Census Block Groups) on
 * 2026-09-01. Public reference geometry, not registrant data, so unlike
 * everything in /data this file is committed to the repo.
 *
 * Re-fetch (state FIPS 13 = Georgia; county FIPS 187/085/311/291/139 =
 * Lumpkin/Dawson/White/Union/Hall):
 *
 * https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/10/query
 *   ?where=STATE='13' AND COUNTY IN ('187','085','311','291','139')
 *   &outFields=GEOID,COUNTY&returnGeometry=true&geometryPrecision=5&outSR=4326&f=geojson
 */
interface BlockGroupFeature {
  type: "Feature";
  properties: { GEOID: string; COUNTY: string };
  geometry:
    | { type: "Polygon"; coordinates: [number, number][][] }
    | { type: "MultiPolygon"; coordinates: [number, number][][][] };
}
interface BlockGroupCollection {
  type: "FeatureCollection";
  features: BlockGroupFeature[];
}

let cached: BlockGroupCollection | null = null;

function load(): BlockGroupCollection {
  if (cached) return cached;
  // process.cwd() rather than __dirname: Next.js's webpack bundling rewrites
  // __dirname to the bundle's output location (e.g. .next/server/app/api/...),
  // where this data file was never copied. process.cwd() is the project root
  // in every context this runs (next dev/start, tsx scripts, vitest).
  const filePath = path.join(process.cwd(), "lib", "geo", "tiger-block-groups.geojson");
  cached = JSON.parse(readFileSync(filePath, "utf-8")) as BlockGroupCollection;
  return cached;
}

/**
 * Point-in-polygon lookup against the loaded block-group boundaries.
 * Returns null if the point falls outside all 188 boundaries (e.g. a
 * synthetic county assignment that doesn't line up with a real coordinate,
 * or a genuinely out-of-area address).
 */
export function findBlockGroupGeoid(
  latitude: number,
  longitude: number
): string | null {
  const { features } = load();
  for (const feature of features) {
    if (pointInGeometry(longitude, latitude, feature.geometry)) {
      return feature.properties.GEOID;
    }
  }
  return null;
}
