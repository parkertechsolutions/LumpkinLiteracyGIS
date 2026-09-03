/**
 * Generates two synthetic CSVs — a registrant file and a geocode file — that
 * exercise the same join, normalization, and ingestion logic the real export
 * pair will require. Distributions below are derived from a hands-on
 * inspection of docs/ExampleData.xlsx (500 registrant rows / 773 geocode rows,
 * inspected 2026-09-01), not invented. Geography weighting and edge-case
 * counts are per explicit build instructions rather than derived from that
 * sample, since the sample only covered Lumpkin County with no adjacent-county
 * spillover.
 *
 * Output never gets committed — see .gitignore.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { faker } from "@faker-js/faker";

// ---------------------------------------------------------------------------
// Deterministic RNG so re-runs are stable. Change the seed to get a fresh set.
// ---------------------------------------------------------------------------
const SEED = 42;
faker.seed(SEED);

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number): number {
  return rand() * (max - min) + min;
}
function pick<T>(items: T[]): T {
  const item = items[randInt(0, items.length - 1)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}
interface Weighted<T> {
  value: T;
  weight: number;
}
function weightedChoice<T>(items: Weighted<T>[]): T {
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1]!.value;
}
// All date math is done in UTC so output is identical regardless of the
// machine's local timezone (new Date("YYYY-MM-DD") parses as UTC midnight;
// mixing that with local-time getters/setters shifts the date by the local
// UTC offset).
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}
function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
function addMonths(d: Date, months: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())
  );
}
function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  );
}
function randomDateBetween(start: Date, end: Date): Date {
  const t = randInt(start.getTime(), end.getTime());
  return new Date(t);
}

// ---------------------------------------------------------------------------
// Reference dates. AS_OF_DATE is the fictional "today" the export represents.
// GEOCODE_RUN_DATE is when the geocode file was produced — earlier than
// AS_OF_DATE, so a handful of address changes can postdate it (stale flag).
// Exported for reuse by ingest.ts.
// ---------------------------------------------------------------------------
export const AS_OF_DATE = utcDate(2026, 9, 1);
export const GEOCODE_RUN_DATE = utcDate(2026, 8, 15);
const REGISTRATION_START = utcDate(2020, 5, 17);

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------
const TOTAL_REGISTRANTS = 800;
const REGISTRANT_ONLY_ORPHANS = 15; // no geocode match
const GEOCODE_ONLY_ORPHANS = 25; // no registrant match
const MISSING_COORDS = 10;
const PO_BOX_NO_GEOCODE = 8;
const LEADING_ZERO_IDS = 12;
const UNICODE_NAMES = 20;
const ADDRESS2_POPULATED = 118; // ~15% of matched geocode rows
const STALE_ADDRESS_CHANGE = 40;

// ---------------------------------------------------------------------------
// Categorical distributions — derived from ExampleData.xlsx (n=500 unless noted)
// ---------------------------------------------------------------------------
const LPP_GROUPS: Weighted<string>[] = [
  { value: "GALUMPKIN-NORTH", weight: 128 },
  { value: "GALUMPKIN-SOUTH", weight: 127 },
  { value: "GALUMPKIN-EAST", weight: 126 },
  { value: "GALUMPKIN-WEST", weight: 119 },
];
const AGE_GROUPS: Weighted<number>[] = [
  { value: 0, weight: 39 },
  { value: 1, weight: 99 },
  { value: 2, weight: 67 },
  { value: 3, weight: 62 },
  { value: 4, weight: 86 },
  { value: 5, weight: 69 },
  { value: 6, weight: 78 },
];
// Inferred age-in-months band per AGE GROUP code (0-5 = age in years, 6 = aged
// past the typical 5-year cutoff but still enrolled). Not confirmed by the
// client — flagged in DATA_DICTIONARY.md follow-up.
const AGE_GROUP_MONTHS_RANGE: Record<number, [number, number]> = {
  0: [0, 11],
  1: [12, 23],
  2: [24, 35],
  3: [36, 47],
  4: [48, 59],
  5: [60, 71],
  6: [72, 83],
};
const BOOK_LANGUAGES: Weighted<string>[] = [
  { value: "English", weight: 420 },
  { value: "Spanish", weight: 80 },
];
const REGISTRATION_TYPES: Weighted<string>[] = [
  { value: "Online", weight: 266 },
  { value: "Regular", weight: 172 },
  { value: "Mail", weight: 62 },
];
const WELCOME_BOOK_Y_RATE = 25 / 500;
const PARENT2_PRESENT_RATE = (500 - 151) / 500;
// EMAIL COMMUNICATION wasn't in the original inspection scope — assumed, not derived.
const EMAIL_COMMUNICATION_Y_RATE = 0.7;

const ADDITIONAL_INFO_1: Weighted<string>[] = [
  { value: "Pediatrician Office", weight: 61 },
  { value: "WIC Office", weight: 60 },
  { value: "Public Library", weight: 58 },
  { value: "Hospital Registration", weight: 55 },
  { value: "School System", weight: 53 },
  { value: "Head Start Program", weight: 48 },
  { value: "Online Search", weight: 45 },
  { value: "Word of Mouth", weight: 44 },
  { value: "Health Department Referral", weight: 41 },
  { value: "Community Event", weight: 35 },
];
const ADDITIONAL_INFO_2: Weighted<string>[] = [
  { value: "Text OK", weight: 174 },
  { value: "Mail only", weight: 94 },
  { value: "Email preferred", weight: 80 },
  { value: "Call after 5pm", weight: 80 },
  { value: "No calls before 9am", weight: 72 },
];
const ADDITIONAL_INFO_3: Weighted<string | null>[] = [
  { value: "Sibling enrolled", weight: 137 },
  { value: null, weight: 86 },
  { value: "Foster placement", weight: 75 },
  { value: "First child enrolled", weight: 71 },
  { value: "Grandparent household", weight: 68 },
  { value: "Twin enrolled", weight: 63 },
];
const ADDITIONAL_INFO_4: Weighted<string | null>[] = [
  { value: null, weight: 258 },
  { value: "Address verified", weight: 64 },
  { value: "Returned mail 2025", weight: 63 },
  { value: "Verified by phone", weight: 61 },
  { value: "Duplicate checked", weight: 54 },
];

const PHONE_AREA_CODES = ["706", "470", "762", "678", "404", "770"];

const UNICODE_NAME_POOL: Array<[string, string]> = [
  ["José", "Núñez"],
  ["Zoë", "Müller"],
  ["François", "Béchard"],
  ["Renée", "Dubois"],
  ["Björn", "Søren"],
  ["Chloé", "Lefèvre"],
  ["Anaïs", "Moreau"],
  ["Naïma", "Dìaz"],
  ["Ximena", "Peña"],
  ["Björk", "Guðmundsdóttir"],
  ["André", "Škoda"],
  ["Amélie", "Girard"],
  ["Iñigo", "Zúñiga"],
  ["Siân", "Llywelyn"],
  ["Yūki", "Nakamura"],
  ["Mateusz", "Wiśniewski"],
  ["Kätlin", "Järvinen"],
  ["Léa", "Fournier"],
  ["Rúben", "Conceição"],
  ["Zsófia", "Kovács"],
];

// ---------------------------------------------------------------------------
// Geography — approximate hand-picked anchors, not authoritative boundaries.
// Real block-group assignment happens later via TIGER point-in-polygon
// (Step 5). This is scatter good enough to exercise filtering/rendering.
// 85% Lumpkin (weighted toward Dahlonega + named corridors, avoiding the
// national-forest north end), 15% spillover to Dawson/White/Union/Hall.
// ---------------------------------------------------------------------------
interface Anchor {
  label: string;
  county: string;
  city: string;
  zipcode: string;
  center: [number, number]; // [lat, lon]
  jitter: number; // degrees
  streets: string[];
  weight: number;
}
const ANCHORS: Anchor[] = [
  {
    label: "Dahlonega town core",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.5327, -83.9843],
    jitter: 0.01,
    streets: ["Chestatee St", "Main St", "Public Sq", "Riley Rd", "Hancock Dr"],
    weight: 0.2,
  },
  {
    label: "US-19/GA-60 south corridor",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.48, -84.0],
    jitter: 0.02,
    streets: ["Highway 19 S", "GA-60 S", "Auraria Rd", "Copper Mine Rd"],
    weight: 0.13,
  },
  {
    label: "US-19/GA-60 north corridor (near town)",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.56, -83.985],
    jitter: 0.015,
    streets: ["Highway 19 N", "GA-60 N", "Camp Wahsega Rd", "Nimblewill Church Rd"],
    weight: 0.08,
  },
  {
    label: "GA-52 east corridor",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.535, -83.9],
    jitter: 0.02,
    streets: ["Highway 52 E", "Yahoola Rd", "Long Branch Rd", "Wimpys Mill Rd"],
    weight: 0.14,
  },
  {
    label: "GA-52 west corridor",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.51, -84.04],
    jitter: 0.02,
    streets: ["Highway 52 W", "Cane Creek Rd", "Wahsega Rd"],
    weight: 0.1,
  },
  {
    label: "GA-9 corridor",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.47, -83.95],
    jitter: 0.018,
    streets: ["Highway 9", "Cavenders Creek Rd", "Grandview Dr"],
    weight: 0.08,
  },
  {
    label: "UNG / North Grove",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30597",
    center: [34.5415, -83.988],
    jitter: 0.006,
    streets: ["University Ave", "North Grove Way", "Panther Dr"],
    weight: 0.05,
  },
  {
    label: "Cane Creek / Yahoola / Long Branch infill",
    county: "Lumpkin",
    city: "Dahlonega",
    zipcode: "30533",
    center: [34.545, -83.955],
    jitter: 0.025,
    streets: ["Yahoola Creek Rd", "Yahoola Lake Rd", "Yellow Creek Rd"],
    weight: 0.07,
  },
  {
    label: "Dawson County / Dawsonville",
    county: "Dawson",
    city: "Dawsonville",
    zipcode: "30534",
    center: [34.4212, -84.1274],
    jitter: 0.02,
    streets: ["Highway 53", "Perimeter Rd", "Shoal Creek Rd"],
    weight: 0.05,
  },
  {
    label: "White County / Cleveland",
    county: "White",
    city: "Cleveland",
    zipcode: "30528",
    center: [34.5998, -83.7632],
    jitter: 0.02,
    streets: ["Highway 129", "Duncan Bridge Rd", "Town Creek School Rd"],
    weight: 0.03,
  },
  {
    label: "Hall County / Murrayville",
    county: "Hall",
    city: "Murrayville",
    zipcode: "30564",
    center: [34.4926, -83.8402],
    jitter: 0.02,
    streets: ["Nix Bridge Rd", "Old Cornelia Hwy", "Turner Rd"],
    weight: 0.03,
  },
  {
    label: "Union County / Suches",
    county: "Union",
    city: "Suches",
    zipcode: "30572",
    center: [34.7423, -84.0007],
    jitter: 0.02,
    streets: ["Highway 60", "Wolf Pen Gap Rd", "Wallalum Rd"],
    weight: 0.02,
  },
  {
    label: "Union County / Blairsville edge",
    county: "Union",
    city: "Blairsville",
    zipcode: "30512",
    center: [34.8, -83.94],
    jitter: 0.02,
    streets: ["Highway 19/129", "Owltown Rd", "Trackrock Rd"],
    weight: 0.02,
  },
];
const ANCHOR_WEIGHTS: Weighted<Anchor>[] = ANCHORS.map((a) => ({
  value: a,
  weight: a.weight,
}));

const ACCURACY_TYPES: Weighted<{ type: string; scoreRange: [number, number] }>[] = [
  { value: { type: "rooftop", scoreRange: [0.87, 1.0] }, weight: 0.35 },
  { value: { type: "range_interpolation", scoreRange: [0.6, 0.86] }, weight: 0.4 },
  { value: { type: "street_center", scoreRange: [0.5, 0.7] }, weight: 0.2 },
  { value: { type: "place", scoreRange: [1.0, 1.0] }, weight: 0.05 },
];

// ---------------------------------------------------------------------------
// Record shape
// ---------------------------------------------------------------------------
interface Registrant {
  childId: string;
  childIdForRegistrantFile: string; // may carry an injected leading zero
  programPartner: string;
  welcomeBook: "Y" | "N";
  graduated: "Y" | "N";
  lastName: string;
  firstName: string;
  middleInitial: string;
  lastTimeAddressChanged: Date;
  phone: string;
  parent1Last: string;
  parent1First: string;
  parent2Last: string | null;
  parent2First: string | null;
  registrationDate: Date;
  registrationType: string;
  birthDate: Date;
  birthCode: string;
  additionalInfo1: string;
  additionalInfo2: string;
  additionalInfo3: string | null;
  additionalInfo4: string | null;
  email: string;
  ageGroup: number;
  monthsRegistered: number;
  projectedGraduation: Date;
  monthsToGraduation: number;
  bookLanguage: string;
  emailCommunication: "Y" | "N";
  lppGroup: string;
}
interface GeocodeRecord {
  childId: string;
  address: string;
  address2: string | null;
  city: string;
  state: string;
  county: string;
  zipcode: string;
  zipcodePlus4: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyScore: number | null;
  accuracyType: string | null;
  matchedAddressLine1: string | null;
}

function randomChildId(used: Set<string>): string {
  let id: string;
  do {
    id = String(randInt(6_000_000, 12_999_999));
  } while (used.has(id));
  used.add(id);
  return id;
}

function buildRegistrant(usedIds: Set<string>): Registrant {
  const childId = randomChildId(usedIds);
  const isUnicode = false; // assigned later by index selection
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const middleInitial = faker.string.alpha({ length: 1, casing: "upper" });

  const ageGroup = weightedChoice(AGE_GROUPS);
  const [minMonths, maxMonths] = AGE_GROUP_MONTHS_RANGE[ageGroup]!;
  const ageMonths = randInt(minMonths, maxMonths);
  const birthDate = addDays(addMonths(AS_OF_DATE, -ageMonths), -randInt(0, 27));

  const registrationDate = randomDateBetween(REGISTRATION_START, AS_OF_DATE);
  const monthsRegistered = Math.max(
    0,
    monthsBetween(registrationDate, AS_OF_DATE)
  );
  const monthsToGraduation = Math.max(0, Math.min(59, 60 - ageMonths));
  const projectedGraduation = addMonths(AS_OF_DATE, monthsToGraduation);
  // The 500-row sample was 100% GRADUATED=N, which looks like an "active
  // only" export filter rather than the true population distribution. A
  // synthetic set that never has a graduate makes the graduated filter
  // (Milestone 3) untestable, so records past the ~60-month program window
  // graduate at a plausible rate instead of being forced to match the sample.
  const graduated: "Y" | "N" = ageMonths >= 60 && rand() < 0.55 ? "Y" : "N";

  const hasParent2 = rand() < PARENT2_PRESENT_RATE;
  const parent1First = faker.person.firstName();
  const parent2First = hasParent2 ? faker.person.firstName() : null;

  const emailNum = randInt(10, 99);
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${emailNum}@example.com`;

  return {
    childId,
    childIdForRegistrantFile: childId,
    programPartner: "GALUMPKIN",
    welcomeBook: rand() < WELCOME_BOOK_Y_RATE ? "Y" : "N",
    graduated,
    lastName,
    firstName,
    middleInitial,
    lastTimeAddressChanged: registrationDate,
    phone: `${pick(PHONE_AREA_CODES)}-${randInt(200, 999)}-${String(
      randInt(0, 9999)
    ).padStart(4, "0")}`,
    parent1Last: lastName,
    parent1First,
    parent2Last: hasParent2 ? lastName : null,
    parent2First,
    registrationDate,
    registrationType: weightedChoice(REGISTRATION_TYPES),
    birthDate,
    birthCode: `${birthDate.getUTCFullYear()}-${pad2(birthDate.getUTCMonth() + 1)}`,
    additionalInfo1: weightedChoice(ADDITIONAL_INFO_1),
    additionalInfo2: weightedChoice(ADDITIONAL_INFO_2),
    additionalInfo3: weightedChoice(ADDITIONAL_INFO_3),
    additionalInfo4: weightedChoice(ADDITIONAL_INFO_4),
    email,
    ageGroup,
    monthsRegistered,
    projectedGraduation,
    monthsToGraduation,
    bookLanguage: weightedChoice(BOOK_LANGUAGES),
    emailCommunication: rand() < EMAIL_COMMUNICATION_Y_RATE ? "Y" : "N",
    lppGroup: weightedChoice(LPP_GROUPS),
  };
}

function buildGeocode(childId: string, addressChangedAt: Date): GeocodeRecord {
  const anchor = weightedChoice(ANCHOR_WEIGHTS);
  const lat = anchor.center[0] + randFloat(-anchor.jitter, anchor.jitter);
  const lon = anchor.center[1] + randFloat(-anchor.jitter, anchor.jitter);
  const houseNumber = randInt(1, 6500);
  const street = pick(anchor.streets);
  const address = `${houseNumber} ${street}`;
  const acc = weightedChoice(ACCURACY_TYPES);
  const accuracyScore = randFloat(acc.scoreRange[0], acc.scoreRange[1]);

  return {
    childId,
    address,
    address2: null,
    city: anchor.city,
    state: "GA",
    county: anchor.county,
    zipcode: anchor.zipcode,
    zipcodePlus4: String(randInt(0, 9999)).padStart(4, "0"),
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    accuracyScore: Number(accuracyScore.toFixed(2)),
    accuracyType: acc.type,
    matchedAddressLine1: `${address}, ${anchor.city}, GA ${anchor.zipcode}`,
  };
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
const usedIds = new Set<string>();
const registrants: Registrant[] = Array.from({ length: TOTAL_REGISTRANTS }, () =>
  buildRegistrant(usedIds)
);

// Unicode names: overwrite a deterministic sample of records.
const unicodeIdx = shuffle(registrants.map((_, i) => i)).slice(0, UNICODE_NAMES);
const unicodePool = shuffle(UNICODE_NAME_POOL);
unicodeIdx.forEach((idx, i) => {
  const [first, last] = unicodePool[i % unicodePool.length]!;
  const r = registrants[idx]!;
  r.firstName = first;
  r.lastName = last;
  r.parent1Last = last;
  if (r.parent2Last) r.parent2Last = last;
});

// Stale address changes: postdate GEOCODE_RUN_DATE.
const staleIdx = shuffle(registrants.map((_, i) => i)).slice(
  0,
  STALE_ADDRESS_CHANGE
);
staleIdx.forEach((idx) => {
  const r = registrants[idx]!;
  r.lastTimeAddressChanged = addDays(GEOCODE_RUN_DATE, randInt(1, 15));
});

// Registrant-only orphans: these ids get no geocode row at all.
const orphanRegistrantIdx = new Set(
  shuffle(registrants.map((_, i) => i)).slice(0, REGISTRANT_ONLY_ORPHANS)
);

// Build the matched pool (everyone not a registrant-only orphan).
const matchedIdx = registrants
  .map((_, i) => i)
  .filter((i) => !orphanRegistrantIdx.has(i));
const shuffledMatched = shuffle(matchedIdx);
const missingCoordsIdx = new Set(shuffledMatched.slice(0, MISSING_COORDS));
const poBoxIdx = new Set(
  shuffledMatched.slice(MISSING_COORDS, MISSING_COORDS + PO_BOX_NO_GEOCODE)
);
const leadingZeroIdx = new Set(
  shuffledMatched.slice(
    MISSING_COORDS + PO_BOX_NO_GEOCODE,
    MISSING_COORDS + PO_BOX_NO_GEOCODE + LEADING_ZERO_IDS
  )
);
const address2Idx = new Set(
  shuffledMatched.slice(
    MISSING_COORDS + PO_BOX_NO_GEOCODE + LEADING_ZERO_IDS,
    MISSING_COORDS + PO_BOX_NO_GEOCODE + LEADING_ZERO_IDS + ADDRESS2_POPULATED
  )
);

// Apply the leading-zero formatting quirk to the registrant-file id only —
// the geocode file keeps the clean numeric id. Ingestion must normalize both.
leadingZeroIdx.forEach((idx) => {
  const r = registrants[idx]!;
  r.childIdForRegistrantFile = `0${r.childId}`;
});

const geocodeRecords: GeocodeRecord[] = [];
for (const idx of matchedIdx) {
  const r = registrants[idx]!;
  const rec = buildGeocode(r.childId, r.lastTimeAddressChanged);

  if (missingCoordsIdx.has(idx)) {
    rec.latitude = null;
    rec.longitude = null;
    rec.accuracyScore = null;
    rec.accuracyType = null;
  } else if (poBoxIdx.has(idx)) {
    const anchor = pick(ANCHORS.filter((a) => a.county === "Lumpkin"));
    rec.address = `Po Box ${randInt(100, 3999)}`;
    rec.city = anchor.city;
    rec.zipcode = anchor.zipcode;
    rec.county = anchor.county;
    rec.latitude = anchor.center[0];
    rec.longitude = anchor.center[1];
    rec.accuracyType = "place";
    rec.accuracyScore = 1.0;
    rec.matchedAddressLine1 = `${anchor.city}, GA ${anchor.zipcode}`;
  }

  if (address2Idx.has(idx)) {
    rec.address2 = pick(["Apt", "Unit", "Ste", "Trlr"]) + " " + randInt(1, 400);
  }

  geocodeRecords.push(rec);
}

// Geocode-only orphans: ids that never appear in the registrant file.
const geocodeOnlyIds: string[] = [];
for (let i = 0; i < GEOCODE_ONLY_ORPHANS; i++) {
  const id = randomChildId(usedIds);
  geocodeOnlyIds.push(id);
  geocodeRecords.push(buildGeocode(id, GEOCODE_RUN_DATE));
}

// ---------------------------------------------------------------------------
// CSV output
// ---------------------------------------------------------------------------
function csvEscape(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(
  filePath: string,
  header: string[],
  rows: (string | number | null)[][]
): void {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

const REGISTRANT_HEADER = [
  "CHILD ID",
  "PROGRAM PARTNER",
  "WELCOME BOOK",
  "GRADUATED",
  "LAST NAME",
  "FIRST NAME",
  "MIDDLE INITIAL",
  "LAST TIME ADDRESS CHANGED",
  "PHONE",
  "PARENT 1 LAST NAME",
  "PARENT 1 FIRST NAME",
  "PARENT 2 LAST NAME",
  "PARENT 2 FIRST NAME",
  "REGISTRATION DATE",
  "REGISTRATION TYPE",
  "BIRTH MONTH",
  "BIRTH DAY",
  "BIRTH YEAR",
  "BIRTH CODE",
  "ADDITIONAL INFORMATION 1",
  "ADDITIONAL INFORMATION 2",
  "ADDITIONAL INFORMATION 3",
  "ADDITIONAL INFORMATION 4",
  "EMAIL",
  "AGE GROUP",
  "MONTHS REGISTERED",
  "PROJECTED GRADUATION",
  "MONTHS TO GRADUATION",
  "BOOK LANGUAGE",
  "EMAIL COMMUNICATION",
  "LPP GROUP",
];

const GEOCODE_HEADER = [
  "CHILD ID",
  "ADDRESS",
  "ADDRESS 2",
  "CITY",
  "STATE",
  "COUNTY",
  "ZIPCODE",
  "ZIPCODE+4",
  "Geocodio Latitude",
  "Geocodio Longitude",
  "Geocodio Accuracy Score",
  "Geocodio Accuracy Type",
  "Geocodio Address Line 1",
];

const registrantRows = registrants.map((r) => [
  r.childIdForRegistrantFile,
  r.programPartner,
  r.welcomeBook,
  r.graduated,
  r.lastName,
  r.firstName,
  r.middleInitial,
  isoDate(r.lastTimeAddressChanged),
  r.phone,
  r.parent1Last,
  r.parent1First,
  r.parent2Last,
  r.parent2First,
  isoDate(r.registrationDate),
  r.registrationType,
  r.birthDate.getUTCMonth() + 1,
  r.birthDate.getUTCDate(),
  r.birthDate.getUTCFullYear(),
  r.birthCode,
  r.additionalInfo1,
  r.additionalInfo2,
  r.additionalInfo3,
  r.additionalInfo4,
  r.email,
  r.ageGroup,
  r.monthsRegistered,
  isoDate(r.projectedGraduation),
  r.monthsToGraduation,
  r.bookLanguage,
  r.emailCommunication,
  r.lppGroup,
]);

const geocodeRows = geocodeRecords.map((g) => [
  g.childId,
  g.address,
  g.address2,
  g.city,
  g.state,
  g.county,
  g.zipcode,
  g.zipcodePlus4,
  g.latitude,
  g.longitude,
  g.accuracyScore,
  g.accuracyType,
  g.matchedAddressLine1,
]);

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
writeCsv(path.join(dataDir, "registrants.csv"), REGISTRANT_HEADER, registrantRows);
writeCsv(path.join(dataDir, "geocode.csv"), GEOCODE_HEADER, geocodeRows);

// ---------------------------------------------------------------------------
// Summary report
// ---------------------------------------------------------------------------
console.log("Synthetic data generated.");
console.log(`  data/registrants.csv: ${registrantRows.length} rows`);
console.log(`  data/geocode.csv:     ${geocodeRows.length} rows`);
console.log("");
console.log("Edge cases:");
console.log(`  registrant-only orphans (no geocode match): ${orphanRegistrantIdx.size}`);
console.log(`  geocode-only orphans (no registrant match): ${geocodeOnlyIds.length}`);
console.log(`  missing/null coordinates:                   ${missingCoordsIdx.size}`);
console.log(`  PO Box addresses, no usable rooftop geocode: ${poBoxIdx.size}`);
console.log(`  LAST TIME ADDRESS CHANGED after geocode run: ${staleIdx.length}`);
console.log(`  leading-zero ids (registrant file only):     ${leadingZeroIdx.size}`);
console.log(`  unicode characters in names:                 ${unicodeIdx.length}`);
console.log(`  populated ADDRESS 2:                         ${address2Idx.size}`);
console.log("");
console.log(`Join key: "CHILD ID" in both files (no name mismatch — confirmed against the real sample).`);
console.log(`GEOCODE_RUN_DATE: ${isoDate(GEOCODE_RUN_DATE)}  AS_OF_DATE: ${isoDate(AS_OF_DATE)}`);
