/**
 * Pure CSV parsing, join, and row-shaping logic — no I/O beyond reading a
 * file, no database. Row-shaping and join are format-agnostic (operate on
 * already-parsed Record<string, string>[] rows), so they're shared by the
 * xlsx-backed readers in lib/ingest/xlsx.ts as well as any future CSV path.
 * Shared by scripts/ingest.ts (loads Postgres) and lib/data/points.ts
 * (serves the Milestone 2 map directly from DPData.xlsx until a Postgres
 * connection is available). See DATA_DICTIONARY.md for the field
 * dispositions this enforces.
 */
import { readFileSync } from "node:fs";
import { findBlockGroupGeoid } from "../geo/block-groups";

// ---------------------------------------------------------------------------
// CSV parsing — hand-rolled because the generator emits RFC4180-quoted
// fields (addresses contain commas) that a naive split(",") would break.
// ---------------------------------------------------------------------------
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows[0];
  if (!header) return [];
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
}

export function readCsvFile(filePath: string): Record<string, string>[] {
  return parseCsv(readFileSync(filePath, "utf-8"));
}

// ---------------------------------------------------------------------------
// Join-key normalization — DATA_DICTIONARY.md rule 5: trim, cast to string,
// strip leading zeros consistently on both sides. The real files use "CHILD
// ID" in both sheets (confirmed against the sample), but PRD flags "ID" as a
// historically possible variant, so both are accepted defensively.
// ---------------------------------------------------------------------------
export function resolveIdKey(row: Record<string, string>): string {
  if ("CHILD ID" in row) return "CHILD ID";
  if ("ID" in row) return "ID";
  throw new Error(
    `No join key column found — expected "CHILD ID" or "ID", got: ${Object.keys(row).join(", ")}`
  );
}

export function normalizeId(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

function field(row: Record<string, string>, name: string): string | null {
  const v = row[name];
  return v === undefined || v === "" ? null : v;
}
function boolField(row: Record<string, string>, name: string): boolean | null {
  const v = field(row, name);
  if (v === null) return null;
  return v.toUpperCase() === "Y";
}
function numField(row: Record<string, string>, name: string): number | null {
  const v = field(row, name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Row shaping — the only place DROP/HOLD fields could leak in is here, by
// selecting a column that isn't in this explicit list. Everything not named
// below (PHONE, EMAIL, PARENT *, BIRTH MONTH/DAY/YEAR, BIRTH CODE,
// ADDITIONAL INFORMATION 1-4) is deliberately never read.
// ---------------------------------------------------------------------------
export interface RegistrantInsert {
  childId: string;
  programPartner: string | null;
  lppGroup: string | null;
  registrationType: string | null;
  registrationDate: string | null;
  welcomeBook: boolean | null;
  graduated: boolean | null;
  ageGroup: string | null;
  monthsRegistered: number | null;
  projectedGraduation: string | null;
  monthsToGraduation: number | null;
  bookLanguage: string | null;
  emailCommunication: boolean | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipcode: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeAccuracy: number | null;
  geocodeAccuracyType: string | null;
  addressChangedAt: string | null;
  geocodeStale: boolean | null;
  blockGroupGeoid: string | null; // point-in-polygon result; null with no coords or no matching boundary
}
export interface IdentityInsert {
  childId: string;
  firstName: string | null;
  lastName: string | null;
  middleInitial: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  zipcodePlus4: string | null;
}

export function buildRegistrantInsert(
  childId: string,
  registrant: Record<string, string> | undefined,
  geocode: Record<string, string> | undefined,
  geocodeRunDate: Date
): RegistrantInsert {
  const addressChangedAt = registrant
    ? field(registrant, "LAST TIME ADDRESS CHANGED")
    : null;
  const geocodeStale =
    addressChangedAt !== null
      ? new Date(addressChangedAt).getTime() > geocodeRunDate.getTime()
      : null;

  const latitude = geocode ? numField(geocode, "Geocodio Latitude") : null;
  const longitude = geocode ? numField(geocode, "Geocodio Longitude") : null;
  const blockGroupGeoid =
    latitude !== null && longitude !== null
      ? findBlockGroupGeoid(latitude, longitude)
      : null;

  return {
    childId,
    programPartner: registrant ? field(registrant, "PROGRAM PARTNER") : null,
    lppGroup: registrant ? field(registrant, "LPP GROUP") : null,
    registrationType: registrant ? field(registrant, "REGISTRATION TYPE") : null,
    registrationDate: registrant ? field(registrant, "REGISTRATION DATE") : null,
    welcomeBook: registrant ? boolField(registrant, "WELCOME BOOK") : null,
    graduated: registrant ? boolField(registrant, "GRADUATED") : null,
    ageGroup: registrant ? field(registrant, "AGE GROUP") : null,
    monthsRegistered: registrant ? numField(registrant, "MONTHS REGISTERED") : null,
    projectedGraduation: registrant
      ? field(registrant, "PROJECTED GRADUATION")
      : null,
    monthsToGraduation: registrant
      ? numField(registrant, "MONTHS TO GRADUATION")
      : null,
    bookLanguage: registrant ? field(registrant, "BOOK LANGUAGE") : null,
    emailCommunication: registrant
      ? boolField(registrant, "EMAIL COMMUNICATION")
      : null,
    city: geocode ? field(geocode, "CITY") : null,
    county: geocode ? field(geocode, "COUNTY") : null,
    state: geocode ? field(geocode, "STATE") : null,
    zipcode: geocode ? field(geocode, "ZIPCODE") : null,
    latitude,
    longitude,
    geocodeAccuracy: geocode ? numField(geocode, "Geocodio Accuracy Score") : null,
    geocodeAccuracyType: geocode
      ? field(geocode, "Geocodio Accuracy Type")
      : null,
    addressChangedAt,
    geocodeStale,
    blockGroupGeoid,
  };
}

export function buildIdentityInsert(
  childId: string,
  registrant: Record<string, string> | undefined,
  geocode: Record<string, string> | undefined
): IdentityInsert {
  return {
    childId,
    firstName: registrant ? field(registrant, "FIRST NAME") : null,
    lastName: registrant ? field(registrant, "LAST NAME") : null,
    middleInitial: registrant ? field(registrant, "MIDDLE INITIAL") : null,
    addressLine1: geocode ? field(geocode, "ADDRESS") : null,
    addressLine2: geocode ? field(geocode, "ADDRESS 2") : null,
    zipcodePlus4: geocode ? field(geocode, "ZIPCODE+4") : null,
  };
}

// ---------------------------------------------------------------------------
// Join
// ---------------------------------------------------------------------------
export interface JoinResult {
  matched: string[];
  registrantOnly: string[];
  geocodeOnly: string[];
  registrantById: Map<string, Record<string, string>>;
  geocodeById: Map<string, Record<string, string>>;
}

export function joinByChildId(
  registrantRows: Record<string, string>[],
  geocodeRows: Record<string, string>[]
): JoinResult {
  const registrantById = new Map<string, Record<string, string>>();
  for (const row of registrantRows) {
    const key = resolveIdKey(row);
    registrantById.set(normalizeId(row[key]!), row);
  }
  const geocodeById = new Map<string, Record<string, string>>();
  for (const row of geocodeRows) {
    const key = resolveIdKey(row);
    geocodeById.set(normalizeId(row[key]!), row);
  }

  const matched: string[] = [];
  const registrantOnly: string[] = [];
  for (const id of registrantById.keys()) {
    if (geocodeById.has(id)) matched.push(id);
    else registrantOnly.push(id);
  }
  const geocodeOnly = [...geocodeById.keys()].filter(
    (id) => !registrantById.has(id)
  );

  return { matched, registrantOnly, geocodeOnly, registrantById, geocodeById };
}
