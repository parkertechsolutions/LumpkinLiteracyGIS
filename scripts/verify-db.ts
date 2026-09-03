/**
 * End-to-end proof that the schema and ingest pipeline actually work against
 * a real Postgres engine, without needing a Neon project or a local Postgres
 * install: PGlite runs real Postgres compiled to WASM, in-process, backed by
 * nothing but memory. It exists only for the life of this script — it is
 * NOT the dev database lib/db/client.ts talks to (that's still plain
 * node-postgres, wired for local Postgres or Neon), and nothing here
 * persists.
 *
 * This runs the actual generated migration SQL, the actual ingest.ts
 * transform/join logic, and then queries information_schema directly —
 * which is DATA_HANDLING.md §6 verification item 8 and the BUILD_PLAN
 * Milestone 1 acceptance check, run for real rather than asserted against
 * the schema module in a unit test.
 *
 * Run: npx tsx scripts/verify-db.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { joinByChildId, buildRegistrantInsert, buildIdentityInsert } from "../lib/ingest/transform";
import { loadDpDataRows } from "../lib/ingest/xlsx";

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

async function main() {
  console.log("=== Milestone 1 verification (PGlite — ephemeral, in-memory Postgres) ===");
  console.log("");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Apply the real generated migrations, not a re-derived one.
  const migrationDir = path.join(process.cwd(), "lib", "db", "migrations");
  const migrationFiles = readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
  let statementCount = 0;
  for (const file of migrationFiles) {
    const migrationFile = readFileSync(path.join(migrationDir, file), "utf-8");
    const statements = migrationFile
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.exec(statement);
    }
    statementCount += statements.length;
  }
  console.log(`Applied ${migrationFiles.length} migration(s): ${statementCount} statements.`);

  // Run the real ingest pipeline against the real synthetic DPData.xlsx.
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
  console.log(
    `Loaded ${registrantInserts.length} registrants and ${identityInserts.length} identity rows.`
  );
  console.log("");

  // --- Verification 1: row counts round-trip correctly ---
  const registrantCount = await db.select({ n: sql<number>`count(*)::int` }).from(schema.registrants);
  const identityCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.registrantIdentity);
  console.log("--- Row counts (queried back from the database) ---");
  console.log(`registrants:         ${registrantCount[0]?.n}`);
  console.log(`registrant_identity: ${identityCount[0]?.n}`);
  const countsMatch =
    registrantCount[0]?.n === registrantInserts.length &&
    identityCount[0]?.n === identityInserts.length;
  console.log(countsMatch ? "PASS — counts match what was sent." : "FAIL — counts don't match.");
  console.log("");

  // --- Verification 2: DATA_HANDLING.md §6 item 8 — excluded columns absent ---
  console.log("--- DATA_HANDLING.md §6 item 8: still-excluded columns absent from schema ---");
  const columnsResult = await db.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('registrants', 'registrant_identity', 'access_log')`
  );
  const actualColumns = columnsResult.rows.map((r) => r.column_name);
  const found = STILL_DROP_OR_HOLD_COLUMNS.filter((c) => actualColumns.includes(c));
  if (found.length === 0) {
    console.log(
      `PASS — none of email, birth code, or additional-information columns exist in any table (checked ${actualColumns.length} actual columns across 3 tables).`
    );
  } else {
    console.log(`FAIL — found excluded columns in the live schema: ${found.join(", ")}`);
  }
  console.log("");

  // --- Verification 3: identity/PII fields (name, phone, parent names,
  // DOB) are only reachable via registrant_identity, never registrants.
  // Address is the one exception — promoted to STAFF disposition on
  // 2026-09-03, so it's expected on registrants and absent from
  // registrant_identity now. ---
  console.log("--- Identity/PII fields isolated to registrant_identity (address excepted) ---");
  const registrantColumns = columnsResult.rows
    .filter((r) => r.table_name === "registrants")
    .map((r) => r.column_name);
  const identityLeaked = ["first_name", "last_name", ...ADMIN_ONLY_COLUMNS].filter((c) =>
    registrantColumns.includes(c)
  );
  console.log(
    identityLeaked.length === 0
      ? "PASS — registrants table has no name/contact/DOB columns."
      : `FAIL — identity fields leaked into registrants: ${identityLeaked.join(", ")}`
  );
  console.log(
    registrantColumns.includes("address_line1") && registrantColumns.includes("address_line2")
      ? "PASS — registrants table has address_line1/2 (STAFF disposition since 2026-09-03)."
      : "FAIL — registrants table is missing address_line1/2."
  );
  const identityColumns = columnsResult.rows
    .filter((r) => r.table_name === "registrant_identity")
    .map((r) => r.column_name);
  const identityMissing = ADMIN_ONLY_COLUMNS.filter((c) => !identityColumns.includes(c));
  console.log(
    identityMissing.length === 0
      ? "PASS — registrant_identity has all the ADMIN-disposition contact/DOB columns."
      : `FAIL — registrant_identity is missing: ${identityMissing.join(", ")}`
  );
  console.log(
    !identityColumns.includes("address_line1") && !identityColumns.includes("address_line2")
      ? "PASS — registrant_identity no longer carries address."
      : "FAIL — address_line1/2 still present in registrant_identity."
  );
  console.log("");

  // --- Verification 4: null coordinates survived ingestion rather than being dropped ---
  const nullCoordRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.registrants)
    .where(sql`latitude is null`);
  console.log("--- Null-coordinate records survive ingestion ---");
  console.log(
    `${nullCoordRows[0]?.n} registrants with null latitude are present in the table (not dropped).`
  );
  console.log("");

  // --- A real query exercising the data, since it's a real database now ---
  const byCounty = await db.execute<{ county: string | null; n: number }>(
    sql`select county, count(*)::int as n from registrants group by county order by n desc`
  );
  console.log("--- Sample query: registrants by county ---");
  for (const row of byCounty.rows) {
    console.log(`  ${row.county ?? "(none — no geocode match)"}: ${row.n}`);
  }

  console.log("");
  console.log("Verification complete. This PGlite instance is discarded on exit.");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
