import { describe, expect, it } from "vitest";
import { pointMatchesFilters, type FilterState } from "./Dashboard";
import type { MapPoint } from "@/lib/data/points";

function point(overrides: Partial<MapPoint>): MapPoint {
  return {
    childId: "1",
    programPartner: "GALUMPKIN",
    ageGroup: "3",
    monthsRegistered: 12,
    projectedGraduation: "2027-01-01",
    monthsToGraduation: 24,
    bookLanguage: "English",
    registrationType: "Online",
    registrationDate: "2024-01-01",
    lppGroup: "GALUMPKIN-NORTH",
    graduated: false,
    welcomeBook: false,
    emailCommunication: true,
    addressChangedAt: "2024-01-01",
    city: "Dahlonega",
    county: "Lumpkin",
    state: "GA",
    zipcode: "30533",
    latitude: 34.5,
    longitude: -83.98,
    geocodeAccuracy: 0.95,
    geocodeAccuracyType: "rooftop",
    geocodeStale: false,
    ...overrides,
  };
}

describe("pointMatchesFilters", () => {
  it("matches everything when no filters are active", () => {
    expect(pointMatchesFilters(point({}), {})).toBe(true);
  });

  it("matches within a single dimension by OR", () => {
    const filters: FilterState = { ageGroup: new Set(["1", "2", "3"]) };
    expect(pointMatchesFilters(point({ ageGroup: "3" }), filters)).toBe(true);
    expect(pointMatchesFilters(point({ ageGroup: "5" }), filters)).toBe(false);
  });

  it("combines dimensions by AND — the user's Spanish + age example", () => {
    const filters: FilterState = {
      bookLanguage: new Set(["Spanish"]),
      ageGroup: new Set(["1", "2", "3", "4", "5"]),
    };
    expect(pointMatchesFilters(point({ bookLanguage: "Spanish", ageGroup: "2" }), filters)).toBe(true);
    expect(pointMatchesFilters(point({ bookLanguage: "English", ageGroup: "2" }), filters)).toBe(false);
    expect(pointMatchesFilters(point({ bookLanguage: "Spanish", ageGroup: "6" }), filters)).toBe(false);
  });

  it("treats an emptied-out dimension as no constraint", () => {
    const filters: FilterState = { county: new Set() };
    expect(pointMatchesFilters(point({ county: "Hall" }), filters)).toBe(true);
  });

  it("matches the (none) bucket for a null field", () => {
    const filters: FilterState = { county: new Set(["(none)"]) };
    expect(pointMatchesFilters(point({ county: null }), filters)).toBe(true);
    expect(pointMatchesFilters(point({ county: "Hall" }), filters)).toBe(false);
  });
});
