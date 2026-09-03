import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb } from "../db/test-helpers";
import { registrantIdentity, registrants } from "../db/schema";
import { searchByName } from "./search";

let client: PGlite;
let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];

beforeAll(async () => {
  const testDb = await createMigratedDb();
  client = testDb.client;
  db = testDb.db;

  await db.insert(registrants).values([
    { childId: "1", programPartner: null },
    { childId: "2", programPartner: null },
    { childId: "3", programPartner: null },
  ]);
  await db.insert(registrantIdentity).values([
    { childId: "1", firstName: "Zoey", lastName: "Hammond" },
    { childId: "2", firstName: "Ava", lastName: "Fortner" },
    { childId: "3", firstName: "Lily", lastName: "Chen" },
  ]);
});

afterAll(async () => {
  await client.close();
});

// Address search moved to client-side (MapView.tsx) on 2026-09-03 — address
// is STAFF-disposition data now, living on `registrants` alongside every
// other staff-visible field, so it no longer needs a server round trip or
// the host/admin gate. Only name search (still ADMIN disposition) is
// exercised here.
describe("searchByName", () => {
  it("matches on last name", async () => {
    const result = await searchByName("Fortner", db);
    expect(result).toEqual(["2"]);
  });

  it("matches on first name", async () => {
    const result = await searchByName("zoey", db);
    expect(result).toEqual(["1"]);
  });

  it("matches a full-name query spanning first and last name", async () => {
    const result = await searchByName("Zoey Hammond", db);
    expect(result).toEqual(["1"]);
  });

  it("returns nothing for a blank query rather than every record", async () => {
    expect(await searchByName("   ", db)).toEqual([]);
  });
});
