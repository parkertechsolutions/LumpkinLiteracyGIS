import type { PgDatabase } from "drizzle-orm/pg-core";
import { registrants } from "../db/schema";
import type * as schema from "../db/schema";

/**
 * Staff/Admin query: every STAFF-disposition field in DATA_DICTIONARY.md —
 * the full registrant + geocode column set, minus anything DROP/HOLD/ADMIN/
 * INTERNAL. addressLine1/addressLine2 were promoted from ADMIN to STAFF on
 * 2026-09-03 (explicit client instruction: the map already plots the exact
 * point for every one of these records, so the address string isn't
 * materially more sensitive) and live on `registrants` itself now, not
 * `registrant_identity`. Name, DOB, phone, parent names, and ZIP+4 remain
 * ADMIN-only and are never read here — that stays in the separate
 * registrant_identity table this module never touches.
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
  addressLine1: string | null;
  addressLine2: string | null;
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

// Accepts either the real node-postgres-backed client or a PGlite-backed
// one built from the same schema (points.test.ts), so the query below can
// be exercised against a real, ephemeral Postgres instead of mocked. The
// real client is imported lazily (only when no db is passed in) so that
// requiring DATABASE_URL to exist — lib/db/client.ts throws at import time
// if it's unset — doesn't block tests that always supply their own db.
type AppDb = PgDatabase<any, typeof schema>;

export async function loadMapPoints(db?: AppDb): Promise<MapPoint[]> {
  const resolvedDb = db ?? (await import("../db/client")).db;
  return resolvedDb
    .select({
      childId: registrants.childId,
      programPartner: registrants.programPartner,
      ageGroup: registrants.ageGroup,
      monthsRegistered: registrants.monthsRegistered,
      projectedGraduation: registrants.projectedGraduation,
      monthsToGraduation: registrants.monthsToGraduation,
      bookLanguage: registrants.bookLanguage,
      registrationType: registrants.registrationType,
      registrationDate: registrants.registrationDate,
      lppGroup: registrants.lppGroup,
      graduated: registrants.graduated,
      welcomeBook: registrants.welcomeBook,
      emailCommunication: registrants.emailCommunication,
      addressChangedAt: registrants.addressChangedAt,
      addressLine1: registrants.addressLine1,
      addressLine2: registrants.addressLine2,
      city: registrants.city,
      county: registrants.county,
      state: registrants.state,
      zipcode: registrants.zipcode,
      latitude: registrants.latitude,
      longitude: registrants.longitude,
      geocodeAccuracy: registrants.geocodeAccuracy,
      geocodeAccuracyType: registrants.geocodeAccuracyType,
      geocodeStale: registrants.geocodeStale,
    })
    .from(registrants);
}
