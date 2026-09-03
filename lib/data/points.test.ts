import { describe, expect, it } from "vitest";
import { loadMapPoints } from "./points";

// Runs against the real synthetic data/DPData.xlsx. FR-12: the Staff points
// response must not contain name, street address, ZIP+4, phone, email,
// parent names, or date of birth — asserted on the actual serialized keys,
// not just on the MapPoint type (which can't catch a field slipping in via
// an untyped spread or a future schema change).
const RESTRICTED_FIELDS = [
  "firstName",
  "lastName",
  "middleInitial",
  "addressLine1",
  "addressLine2",
  "zipcodePlus4",
  "phone",
  "email",
  "parent1FirstName",
  "parent1LastName",
  "parent2FirstName",
  "parent2LastName",
  "birthMonth",
  "birthDay",
  "birthYear",
];

describe("loadMapPoints", () => {
  it("returns records", async () => {
    const points = await loadMapPoints();
    expect(points.length).toBeGreaterThan(0);
  });

  it("never includes an identity or contact field", async () => {
    const points = await loadMapPoints();
    for (const point of points) {
      for (const restricted of RESTRICTED_FIELDS) {
        expect(Object.keys(point)).not.toContain(restricted);
      }
    }
  });

  it("carries a childId on every record", async () => {
    const points = await loadMapPoints();
    for (const point of points) {
      expect(point.childId).toBeTruthy();
    }
  });

  it("carries every STAFF-disposition field DATA_DICTIONARY.md defines", async () => {
    const points = await loadMapPoints();
    const keys = Object.keys(points[0]!);
    for (const staffField of [
      "registrationType",
      "registrationDate",
      "lppGroup",
      "emailCommunication",
      "addressChangedAt",
      "state",
      "geocodeAccuracy",
    ]) {
      expect(keys).toContain(staffField);
    }
  });
});
