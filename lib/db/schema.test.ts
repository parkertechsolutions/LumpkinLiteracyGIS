import { describe, expect, it } from "vitest";
import { registrants, registrantIdentity, accessLog } from "./schema";

// Static assertion, not a live query — see BUILD_PLAN.md Milestone 1
// acceptance for the real check ("a direct database query confirms the
// excluded columns are absent from the schema"), which needs a running
// Postgres and isn't available in this environment. This test catches the
// same class of mistake — a DROP/HOLD field accidentally added to a
// table definition — without needing a database connection.
//
// emailCommunication is DATA_DICTIONARY.md's own STAFF-disposition flag
// (distinct from the DROP-disposition "email" address column) — it belongs
// in the schema, so it's deliberately not in either list below.
//
// phone/parent1*/parent2*/birthMonth/birthDay/birthYear were promoted from
// DROP to ADMIN on 2026-09-03 (explicit client instruction — see
// DATA_DICTIONARY.md) and now legitimately live in registrant_identity, the
// reveal-only table — so they're forbidden everywhere ELSE (registrants,
// access_log) but expected to be present in registrant_identity.
const STILL_DROP_OR_HOLD_COLUMNS = [
  "email",
  "birthCode",
  "additionalInformation1",
  "additionalInformation2",
  "additionalInformation3",
  "additionalInformation4",
];

const ADMIN_ONLY_COLUMNS = [
  "phone",
  "parent1FirstName",
  "parent1LastName",
  "parent2FirstName",
  "parent2LastName",
  "birthMonth",
  "birthDay",
  "birthYear",
];

describe("registrants schema", () => {
  it("does not define any DROP/HOLD or ADMIN-only identity column", () => {
    for (const column of [...STILL_DROP_OR_HOLD_COLUMNS, ...ADMIN_ONLY_COLUMNS]) {
      expect(column in registrants).toBe(false);
    }
  });
  it("defines the expected STAFF columns", () => {
    expect("childId" in registrants).toBe(true);
    expect("ageGroup" in registrants).toBe(true);
    expect("blockGroupGeoid" in registrants).toBe(true);
  });
  it("defines address — promoted from ADMIN to STAFF disposition 2026-09-03", () => {
    expect("addressLine1" in registrants).toBe(true);
    expect("addressLine2" in registrants).toBe(true);
    expect("addressLine1" in registrantIdentity).toBe(false);
    expect("addressLine2" in registrantIdentity).toBe(false);
  });
});

describe("registrant_identity schema", () => {
  it("does not define any still-DROP/HOLD column", () => {
    for (const column of STILL_DROP_OR_HOLD_COLUMNS) {
      expect(column in registrantIdentity).toBe(false);
    }
  });
  it("defines the ADMIN-disposition identity fields, kept out of the registrants table", () => {
    for (const column of ["firstName", "lastName", "zipcodePlus4", ...ADMIN_ONLY_COLUMNS]) {
      expect(column in registrantIdentity).toBe(true);
      expect(column in registrants).toBe(false);
    }
  });
});

describe("access_log schema", () => {
  it("does not define any DROP/HOLD or ADMIN-only identity column", () => {
    for (const column of [...STILL_DROP_OR_HOLD_COLUMNS, ...ADMIN_ONLY_COLUMNS]) {
      expect(column in accessLog).toBe(false);
    }
  });
});
