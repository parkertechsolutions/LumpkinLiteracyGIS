import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { joinByChildId, buildRegistrantInsert, buildIdentityInsert } from "../lib/ingest/transform";
import { loadDpDataRows } from "../lib/ingest/xlsx";

// Runs the real generated migration and the real ingest pipeline against
// PGlite (real Postgres compiled to WASM, in-memory, discarded after the
// test file finishes) rather than a live Postgres/Neon connection, which
// this environment doesn't have. This is the automated version of
// DATA_HANDLING.md §6 item 8 and the BUILD_PLAN Milestone 1 acceptance
// check — a real information_schema query, not a schema-module assertion.

// email_communication is DATA_DICTIONARY.md's own STAFF-disposition flag
// (distinct from the DROP-disposition "email" address column) — it belongs
// in the schema, so it's deliberately not in either list below.
//
// phone/parent_1_*/parent_2_*/birth_month/birth_day/birth_year were
// promoted from DROP to ADMIN on 2026-09-03 (explicit client instruction —
// see DATA_DICTIONARY.md) and now legitimately live in registrant_identity
// — forbidden everywhere ELSE, expected to be present there.
const STILL_DROP_OR_HOLD_COLUMNS = [
  "email",
  "birth_code",
  "additional_information_1",
  "additional_information_2",
  "additional_information_3",
  "additional_information_4",
];
const ADMIN_ONLY_COLUMNS = [
  "phone",
  "parent1_first_name",
  "parent1_last_name",
  "parent2_first_name",
  "parent2_last_name",
  "birth_month",
  "birth_day",
  "birth_year",
];

let client: PGlite;
let db: ReturnType<typeof drizzle>;
let registrantInsertCount = 0;
let identityInsertCount = 0;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });

  const migrationsDir = path.join(process.cwd(), "lib", "db", "migrations");
  const migrationFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    const migrationFile = readFileSync(path.join(migrationsDir, file), "utf-8");
    for (const statement of migrationFile.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await client.exec(statement);
    }
  }

  const { registrantRows, geocodeRows } = await loadDpDataRows();
  const join = joinByChildId(registrantRows, geocodeRows);
  const geocodeRunDate = new Date("2026-08-15");

  const registrantInserts = [];
  const identityInserts = [];
  for (const id of [...join.matched, ...join.registrantOnly]) {
    const registrant = join.registrantById.get(id);
    const geocode = join.geocodeById.get(id);
    registrantInserts.push(buildRegistrantInsert(id, registrant, geocode, geocodeRunDate));
    identityInserts.push(buildIdentityInsert(id, registrant, geocode));
  }
  registrantInsertCount = registrantInserts.length;
  identityInsertCount = identityInserts.length;

  await db.insert(schema.registrants).values(registrantInserts);
  await db.insert(schema.registrantIdentity).values(identityInserts);
});

afterAll(async () => {
  await client.close();
});

describe("live database verification (PGlite)", () => {
  it("loads every registrant and identity row from the synthetic DPData.xlsx", async () => {
    const registrantCount = await db.select({ n: sql<number>`count(*)::int` }).from(schema.registrants);
    const identityCount = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.registrantIdentity);
    expect(registrantCount[0]?.n).toBe(registrantInsertCount);
    expect(identityCount[0]?.n).toBe(identityInsertCount);
  });

  it("has no still-DROP/HOLD column in any table's live schema", async () => {
    const columnsResult = await db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('registrants', 'registrant_identity', 'access_log')`
    );
    const actualColumns = columnsResult.rows.map((r) => r.column_name);
    for (const forbidden of STILL_DROP_OR_HOLD_COLUMNS) {
      expect(actualColumns).not.toContain(forbidden);
    }
  });

  it("keeps identity fields (including the ADMIN-only DOB/contact ones) out of the registrants table", async () => {
    const columnsResult = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registrants'`
    );
    const registrantColumns = columnsResult.rows.map((r) => r.column_name);
    expect(registrantColumns).not.toContain("first_name");
    expect(registrantColumns).not.toContain("last_name");
    for (const column of ADMIN_ONLY_COLUMNS) {
      expect(registrantColumns).not.toContain(column);
    }
  });

  it("stores the ADMIN-only DOB/contact fields in registrant_identity", async () => {
    const columnsResult = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registrant_identity'`
    );
    const identityColumns = columnsResult.rows.map((r) => r.column_name);
    for (const column of ADMIN_ONLY_COLUMNS) {
      expect(identityColumns).toContain(column);
    }
    // Address moved OUT of registrant_identity on 2026-09-03 — it's
    // STAFF-disposition now, living on registrants instead.
    expect(identityColumns).not.toContain("address_line1");
    expect(identityColumns).not.toContain("address_line2");
  });

  it("stores address on registrants — promoted from ADMIN to STAFF disposition 2026-09-03", async () => {
    const columnsResult = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registrants'`
    );
    const registrantColumns = columnsResult.rows.map((r) => r.column_name);
    expect(registrantColumns).toContain("address_line1");
    expect(registrantColumns).toContain("address_line2");
  });

  it("keeps null-coordinate registrants in the table instead of dropping them", async () => {
    const result = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.registrants)
      .where(sql`latitude is null`);
    expect(result[0]?.n).toBeGreaterThan(0);
  });
});
