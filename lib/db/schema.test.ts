import { describe, expect, it } from "vitest";
import { registrants, registrantIdentity, accessLog } from "./schema";

// Static assertion, not a live query — see BUILD_PLAN.md Milestone 1
// acceptance for the real check ("a direct database query confirms the
// excluded columns are absent from the schema"), which needs a running
// Postgres and isn't available in this environment. This test catches the
// same class of mistake — a DROP/HOLD field accidentally added to a
// table definition — without needing a database connection.
const FORBIDDEN_COLUMNS = [
  "phone",
  "email",
  "emailCommunication",
  "parent1FirstName",
  "parent1LastName",
  "parent2FirstName",
  "parent2LastName",
  "birthMonth",
  "birthDay",
  "birthYear",
  "birthCode",
  "additionalInformation1",
  "additionalInformation2",
  "additionalInformation3",
  "additionalInformation4",
];

describe("registrants schema", () => {
  it("does not define any DROP/HOLD column", () => {
    for (const column of FORBIDDEN_COLUMNS) {
      expect(column in registrants).toBe(false);
    }
  });
  it("defines the expected STAFF columns", () => {
    expect("childId" in registrants).toBe(true);
    expect("ageGroup" in registrants).toBe(true);
    expect("blockGroupGeoid" in registrants).toBe(true);
  });
});

describe("registrant_identity schema", () => {
  it("does not define any DROP/HOLD column", () => {
    for (const column of FORBIDDEN_COLUMNS) {
      expect(column in registrantIdentity).toBe(false);
    }
  });
  it("carries only identity fields, kept out of the registrants table", () => {
    expect("firstName" in registrantIdentity).toBe(true);
    expect("addressLine1" in registrantIdentity).toBe(true);
    expect("firstName" in registrants).toBe(false);
    expect("addressLine1" in registrants).toBe(false);
  });
});

describe("access_log schema", () => {
  it("does not define any DROP/HOLD column", () => {
    for (const column of FORBIDDEN_COLUMNS) {
      expect(column in accessLog).toBe(false);
    }
  });
});
