import path from "node:path";
import {
  readCsvFile,
  joinByChildId,
  buildRegistrantInsert,
} from "../ingest/transform";

/**
 * Milestone 2 stand-in for a Postgres query: reads the same CSVs ingest.ts
 * would load, in-memory, on every request. No DATABASE_URL is wired up yet.
 * Swap this for a real `/api/points` query against the `registrants` table
 * once Milestone 4/5 need server-side role filtering — this file has no
 * caller outside app/api/points, so it's a contained swap.
 *
 * Field list is PRD FR-11/FR-12's detail-panel set, plus the geocode fields
 * FR-13/FR-14 need for symbology, plus registrationType/lppGroup (STAFF
 * disposition per DATA_DICTIONARY.md, needed for the dashboard breakdowns —
 * not in FR-11's panel list but not restricted either). No ADMIN identity
 * field (name, address) is read here at all.
 */
export interface MapPoint {
  childId: string;
  programPartner: string | null;
  ageGroup: string | null;
  monthsRegistered: number | null;
  projectedGraduation: string | null;
  monthsToGraduation: number | null;
  bookLanguage: string | null;
  registrationType: string | null;
  lppGroup: string | null;
  graduated: boolean | null;
  welcomeBook: boolean | null;
  city: string | null;
  county: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeAccuracyType: string | null;
  geocodeStale: boolean | null;
}

const GEOCODE_RUN_DATE = new Date(process.env.GEOCODE_RUN_DATE ?? "2026-08-15");

export function loadMapPoints(): MapPoint[] {
  const registrantRows = readCsvFile(
    path.join(process.cwd(), "data", "registrants.csv")
  );
  const geocodeRows = readCsvFile(path.join(process.cwd(), "data", "geocode.csv"));
  const join = joinByChildId(registrantRows, geocodeRows);

  const points: MapPoint[] = [];
  for (const id of [...join.matched, ...join.registrantOnly]) {
    const registrant = join.registrantById.get(id);
    const geocode = join.geocodeById.get(id);
    const row = buildRegistrantInsert(id, registrant, geocode, GEOCODE_RUN_DATE);
    points.push({
      childId: row.childId,
      programPartner: row.programPartner,
      ageGroup: row.ageGroup,
      monthsRegistered: row.monthsRegistered,
      projectedGraduation: row.projectedGraduation,
      monthsToGraduation: row.monthsToGraduation,
      bookLanguage: row.bookLanguage,
      registrationType: row.registrationType,
      lppGroup: row.lppGroup,
      graduated: row.graduated,
      welcomeBook: row.welcomeBook,
      city: row.city,
      county: row.county,
      zipcode: row.zipcode,
      latitude: row.latitude,
      longitude: row.longitude,
      geocodeAccuracyType: row.geocodeAccuracyType,
      geocodeStale: row.geocodeStale,
    });
  }
  return points;
}
