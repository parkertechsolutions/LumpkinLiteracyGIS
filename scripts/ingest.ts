/**
 * Reads DPData.xlsx ("Data" + "GeoCode Info" sheets), joins them on child
 * id, drops every DROP/HOLD field per DATA_DICTIONARY.md, derives
 * geocode_stale and block_group_geoid, and loads the permitted columns into
 * Postgres. Prints a match report at the end.
 *
 * The join/transform logic lives in lib/ingest/transform.ts, shared with the
 * Milestone 2 map API route — this file is just the CLI wrapper that prints
 * the report and writes to Postgres when DATABASE_URL is set.
 *
 * Run: npm run ingest -- [path to DPData.xlsx]
 */
import { pathToFileURL } from "node:url";
import {
  joinByChildId,
  buildRegistrantInsert,
  buildIdentityInsert,
  type RegistrantInsert,
  type IdentityInsert,
} from "../lib/ingest/transform";
import { loadDpDataRows } from "../lib/ingest/xlsx";

async function main() {
  const geocodeRunDate = new Date(process.env.GEOCODE_RUN_DATE ?? "2026-08-15");

  const { registrantRows, geocodeRows } = await loadDpDataRows(
    process.argv[2]
  );
  const join = joinByChildId(registrantRows, geocodeRows);

  const registrantInserts: RegistrantInsert[] = [];
  const identityInserts: IdentityInsert[] = [];

  for (const id of [...join.matched, ...join.registrantOnly]) {
    const registrant = join.registrantById.get(id);
    const geocode = join.geocodeById.get(id);
    registrantInserts.push(
      buildRegistrantInsert(id, registrant, geocode, geocodeRunDate)
    );
    identityInserts.push(buildIdentityInsert(id, registrant, geocode));
  }
  // Geocode-only orphans have no registrant record to attach program data
  // to — reported below, but not loaded as a registrants row.

  const missingCoords = registrantInserts.filter(
    (r) => r.latitude === null || r.longitude === null
  );
  const stale = registrantInserts.filter((r) => r.geocodeStale === true);
  const accuracyCounts = new Map<string, number>();
  for (const r of registrantInserts) {
    const key = r.geocodeAccuracyType ?? "(none)";
    accuracyCounts.set(key, (accuracyCounts.get(key) ?? 0) + 1);
  }

  console.log("=== Match report ===");
  console.log(`Registrant file rows: ${registrantRows.length}`);
  console.log(`Geocode file rows:    ${geocodeRows.length}`);
  console.log(`Matched:              ${join.matched.length}`);
  console.log(
    `Registrant-only (no geocode): ${join.registrantOnly.length}${
      join.registrantOnly.length ? ` — ${join.registrantOnly.join(", ")}` : ""
    }`
  );
  console.log(
    `Geocode-only (no registrant):  ${join.geocodeOnly.length}${
      join.geocodeOnly.length ? ` — ${join.geocodeOnly.join(", ")}` : ""
    }`
  );
  console.log(`Missing coordinates:  ${missingCoords.length}`);
  console.log(`Flagged stale:        ${stale.length}`);
  console.log("Accuracy type counts:");
  for (const [type, count] of accuracyCounts) {
    console.log(`  ${type}: ${count}`);
  }
  const withBlockGroup = registrantInserts.filter(
    (r) => r.blockGroupGeoid !== null
  );
  const outsideBoundaries = registrantInserts.filter(
    (r) => r.latitude !== null && r.longitude !== null && r.blockGroupGeoid === null
  );
  console.log(
    `Block group assigned: ${withBlockGroup.length}  (no coordinates: ${missingCoords.length}, coordinates outside the 5-county boundary set: ${outsideBoundaries.length})`
  );

  if (!process.env.DATABASE_URL) {
    console.log("");
    console.log(
      "DATABASE_URL not set — skipping database load. Set it and re-run to write to Postgres."
    );
    return;
  }

  const { db } = await import("../lib/db/client");
  const { registrants, registrantIdentity } = await import("../lib/db/schema");
  // Full reload rather than upsert: re-running ingest against a newer file
  // (e.g. the real DPData.xlsx once it replaces the synthetic one) should
  // leave the database matching that file exactly, not merge with whatever
  // was loaded last time. registrant_identity references registrants, so it
  // must be cleared first.
  await db.delete(registrantIdentity);
  await db.delete(registrants);
  await db.insert(registrants).values(registrantInserts);
  await db.insert(registrantIdentity).values(identityInserts);
  console.log("");
  console.log(
    `Loaded ${registrantInserts.length} registrants and ${identityInserts.length} identity rows.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
