import { describe, expect, it } from "vitest";
import { findBlockGroupGeoid } from "./block-groups";

describe("findBlockGroupGeoid", () => {
  it("resolves a Dahlonega town-center point to a Lumpkin County (13187) block group", () => {
    const geoid = findBlockGroupGeoid(34.5327, -83.9843);
    expect(geoid).not.toBeNull();
    expect(geoid?.startsWith("13187")).toBe(true);
  });

  it("resolves a Dawsonville point to a Dawson County (13085) block group", () => {
    const geoid = findBlockGroupGeoid(34.4212, -84.1274);
    expect(geoid).not.toBeNull();
    expect(geoid?.startsWith("13085")).toBe(true);
  });

  it("returns null for a point far outside the 5-county boundary set", () => {
    expect(findBlockGroupGeoid(0, 0)).toBeNull();
  });
});
