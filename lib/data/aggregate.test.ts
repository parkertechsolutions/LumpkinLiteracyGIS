import { beforeAll, describe, expect, it } from "vitest";
import { loadAggregateGeoJson } from "./aggregate";

// Runs against the real synthetic data/DPData.xlsx — same fixture the other
// data-layer tests use. This is FR-8 / DATA_HANDLING.md's suppression rule:
// no area below the threshold should be visible at all, not even as a
// placeholder with no value.
const SUPPRESSION_THRESHOLD = 5;

describe("loadAggregateGeoJson", () => {
  let result: GeoJSON.FeatureCollection;
  beforeAll(async () => {
    result = await loadAggregateGeoJson();
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
