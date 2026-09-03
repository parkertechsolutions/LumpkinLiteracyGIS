import { readFileSync } from "node:fs";
import path from "node:path";
import { joinByChildId, buildRegistrantInsert } from "../ingest/transform";
import { loadDpDataRows } from "../ingest/xlsx";

/**
 * Viewer-role data: counts by census block group, nothing else. FR-6/FR-8 —
 * aggregated to block group, areas below the suppression threshold return
 * no count at all rather than a suppressed placeholder, since even "this
 * area has 1-4 registrants" is more than a Viewer is entitled to know.
 *
 * Same DPData.xlsx-backed stand-in as lib/data/points.ts — see that file's
 * header comment for why, and for the plan to swap this for a real Postgres
 * GROUP BY once Milestone 4/5 need it for real.
 */
const GEOCODE_RUN_DATE = new Date(process.env.GEOCODE_RUN_DATE ?? "2026-08-15");
const SUPPRESSION_THRESHOLD = 5;

interface BlockGroupFeature {
  type: "Feature";
  properties: { GEOID: string; COUNTY: string };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export async function loadAggregateGeoJson(): Promise<GeoJSON.FeatureCollection> {
  const { registrantRows, geocodeRows } = await loadDpDataRows();
  const join = joinByChildId(registrantRows, geocodeRows);

  const counts = new Map<string, number>();
  for (const id of [...join.matched, ...join.registrantOnly]) {
    const registrant = join.registrantById.get(id);
    const geocode = join.geocodeById.get(id);
    const row = buildRegistrantInsert(id, registrant, geocode, GEOCODE_RUN_DATE);
    if (!row.blockGroupGeoid) continue;
    counts.set(row.blockGroupGeoid, (counts.get(row.blockGroupGeoid) ?? 0) + 1);
  }

  const boundaries = JSON.parse(
    readFileSync(path.join(process.cwd(), "lib", "geo", "tiger-block-groups.geojson"), "utf-8")
  ) as { features: BlockGroupFeature[] };

  const features: GeoJSON.Feature[] = [];
  for (const f of boundaries.features) {
    const count = counts.get(f.properties.GEOID) ?? 0;
    if (count < SUPPRESSION_THRESHOLD) continue;
    features.push({
      type: "Feature",
      properties: { GEOID: f.properties.GEOID, count },
      geometry: f.geometry,
    });
  }

  return { type: "FeatureCollection", features };
}
