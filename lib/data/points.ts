import { joinByChildId, buildRegistrantInsert } from "../ingest/transform";
import { loadDpDataRows } from "../ingest/xlsx";

/**
 * Milestone 2 stand-in for a Postgres query: reads DPData.xlsx, in-memory,
 * on every request. No DATABASE_URL is wired up yet. Swap this for a real
 * `/api/points` query against the `registrants` table once Milestone 4/5
 * need server-side role filtering — this file has no caller outside
 * app/api/points, so it's a contained swap.
 *
 * Field list is every STAFF-disposition field in DATA_DICTIONARY.md — the
 * full registrant + geocode column set, minus anything DROP/HOLD/ADMIN/
 * INTERNAL. No ADMIN identity field (name, address) is read here at all.
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
  registrationDate: string | null;
  lppGroup: string | null;
  graduated: boolean | null;
  welcomeBook: boolean | null;
  emailCommunication: boolean | null;
  addressChangedAt: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeAccuracy: number | null;
  geocodeAccuracyType: string | null;
  geocodeStale: boolean | null;
}

const GEOCODE_RUN_DATE = new Date(process.env.GEOCODE_RUN_DATE ?? "2026-08-15");

export async function loadMapPoints(): Promise<MapPoint[]> {
  const { registrantRows, geocodeRows } = await loadDpDataRows();
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
      registrationDate: row.registrationDate,
      lppGroup: row.lppGroup,
      graduated: row.graduated,
      welcomeBook: row.welcomeBook,
      emailCommunication: row.emailCommunication,
      addressChangedAt: row.addressChangedAt,
      city: row.city,
      county: row.county,
      state: row.state,
      zipcode: row.zipcode,
      latitude: row.latitude,
      longitude: row.longitude,
      geocodeAccuracy: row.geocodeAccuracy,
      geocodeAccuracyType: row.geocodeAccuracyType,
      geocodeStale: row.geocodeStale,
    });
  }
  return points;
}
