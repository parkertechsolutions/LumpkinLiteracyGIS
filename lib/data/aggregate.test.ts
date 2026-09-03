import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-helpers";
import { loadAggregateGeoJson } from "./aggregate";

// Runs against a real Postgres instance (PGlite) seeded from the synthetic
// DPData.xlsx via the real ingest pipeline — see lib/db/test-helpers.ts,
// same fixture the other data-layer tests use. This is FR-8 /
// DATA_HANDLING.md's suppression rule: no area below the threshold should
// be visible at all, not even as a placeholder with no value.
const SUPPRESSION_THRESHOLD = 5;

let client: PGlite;

describe("loadAggregateGeoJson", () => {
  let result: GeoJSON.FeatureCollection;
  beforeAll(async () => {
    const testDb = await createTestDb();
    client = testDb.client;
    result = await loadAggregateGeoJson(testDb.db);
  });

  afterAll(async () => {
    await client.close();
  });

  it("returns a GeoJSON FeatureCollection", () => {
    expect(result.type).toBe("FeatureCollection");
    expect(result.features.length).toBeGreaterThan(0);
  });

  it("never returns an area below the suppression threshold", () => {
    for (const feature of result.features) {
      expect(feature.properties?.count).toBeGreaterThanOrEqual(SUPPRESSION_THRESHOLD);
    }
  });

  it("carries a GEOID and count only — no per-record identity or field", () => {
    for (const feature of result.features) {
      expect(Object.keys(feature.properties ?? {}).sort()).toEqual(["GEOID", "count"]);
    }
  });
});
