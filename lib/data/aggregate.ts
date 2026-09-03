import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { registrants } from "../db/schema";
import type * as schema from "../db/schema";

/**
 * Viewer-role data: counts by census block group, nothing else. FR-6/FR-8 —
 * aggregated to block group, areas below the suppression threshold return
 * no count at all rather than a suppressed placeholder, since even "this
 * area has 1-4 registrants" is more than a Viewer is entitled to know.
 *
 * The count itself comes from a real `GROUP BY` in Postgres, not a
 * client-computed tally — no individual record ever leaves the database for
 * this role.
 */
const SUPPRESSION_THRESHOLD = 5;

// The real client is imported lazily (only when no db is passed in) so that
// requiring DATABASE_URL to exist — lib/db/client.ts throws at import time
// if it's unset — doesn't block tests that always supply their own db.
type AppDb = PgDatabase<any, typeof schema>;

interface BlockGroupFeature {
  type: "Feature";
  properties: { GEOID: string; COUNTY: string };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

export async function loadAggregateGeoJson(
  db?: AppDb
): Promise<GeoJSON.FeatureCollection> {
  const resolvedDb = db ?? (await import("../db/client")).db;
  const rows = await resolvedDb
    .select({
      blockGroupGeoid: registrants.blockGroupGeoid,
      n: sql<number>`count(*)::int`,
    })
    .from(registrants)
    .where(sql`${registrants.blockGroupGeoid} is not null`)
    .groupBy(registrants.blockGroupGeoid);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.blockGroupGeoid) counts.set(row.blockGroupGeoid, row.n);
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
