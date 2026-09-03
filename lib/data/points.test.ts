import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-helpers";
import { loadMapPoints } from "./points";

// Runs against a real Postgres instance (PGlite) seeded from the synthetic
// DPData.xlsx via the real ingest pipeline — see lib/db/test-helpers.ts.
// FR-12 (as amended 2026-09-03: street address is now STAFF-disposition,
// see DATA_DICTIONARY.md): the Staff points response must not contain name,
// ZIP+4, phone, email, parent names, or date of birth — asserted on the
// actual serialized keys, not just on the MapPoint type (which can't catch
// a field slipping in via an untyped spread or a future schema change).
const RESTRICTED_FIELDS = [
  "firstName",
  "lastName",
  "middleInitial",
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

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeAll(async () => {
  const testDb = await createTestDb();
  client = testDb.client;
  db = testDb.db;
});

afterAll(async () => {
  await client.close();
});

describe("loadMapPoints", () => {
  it("returns records", async () => {
    const points = await loadMapPoints(db);
    expect(points.length).toBeGreaterThan(0);
  });

  it("never includes an identity or contact field", async () => {
    const points = await loadMapPoints(db);
    for (const point of points) {
      for (const restricted of RESTRICTED_FIELDS) {
        expect(Object.keys(point)).not.toContain(restricted);
      }
    }
  });

  it("carries a childId on every record", async () => {
    const points = await loadMapPoints(db);
    for (const point of points) {
      expect(point.childId).toBeTruthy();
    }
  });

  it("carries every STAFF-disposition field DATA_DICTIONARY.md defines", async () => {
    const points = await loadMapPoints(db);
    const keys = Object.keys(points[0]!);
    for (const staffField of [
      "registrationType",
      "registrationDate",
      "lppGroup",
      "emailCommunication",
      "addressChangedAt",
      "addressLine1",
      "addressLine2",
      "state",
      "geocodeAccuracy",
    ]) {
      expect(keys).toContain(staffField);
    }
  });
});
