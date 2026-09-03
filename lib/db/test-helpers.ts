import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import {
  joinByChildId,
  buildRegistrantInsert,
  buildIdentityInsert,
} from "../ingest/transform";
import { loadDpDataRows } from "../ingest/xlsx";

/**
 * Real Postgres (compiled to WASM via PGlite), in-memory, migrated with the
 * actual generated migration SQL and seeded from the real synthetic
 * DPData.xlsx through the real ingest pipeline — so data-layer tests
 * (lib/data/points.test.ts, lib/data/aggregate.test.ts) exercise the same
 * queries production runs, without a live Postgres/Neon connection. Same
 * approach as scripts/verify-db.ts/.test.ts.
 */
// Just the migrated schema, no seed data — for tests (e.g. admin user
// management) that don't need the synthetic registrant fixture at all and
// shouldn't pay to parse it.
export async function createMigratedDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  const migrationsDir = path.join(process.cwd(), "lib", "db", "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const migrationFile = readFileSync(path.join(migrationsDir, file), "utf-8");
    for (const statement of migrationFile
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.exec(statement);
    }
  }

  return { db, client };
}

export async function createTestDb() {
  const { db, client } = await createMigratedDb();

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

  await db.insert(schema.registrants).values(registrantInserts);
  await db.insert(schema.registrantIdentity).values(identityInserts);

  return { db, client, registrantCount: registrantInserts.length, identityCount: identityInserts.length };
}
