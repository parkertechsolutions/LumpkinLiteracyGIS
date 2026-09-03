import { describe, expect, it } from "vitest";
import {
  normalizeId,
  resolveIdKey,
  joinByChildId,
  buildRegistrantInsert,
  buildIdentityInsert,
} from "./transform";

describe("normalizeId", () => {
  it("strips leading zeros", () => {
    expect(normalizeId("00123456")).toBe("123456");
  });
  it("trims whitespace", () => {
    expect(normalizeId("  123456  ")).toBe("123456");
  });
  it("collapses an all-zero id to a single zero", () => {
    expect(normalizeId("0000")).toBe("0");
  });
  it("leaves an id with no leading zeros unchanged", () => {
    expect(normalizeId("9218528")).toBe("9218528");
  });
});

describe("resolveIdKey", () => {
  it("finds CHILD ID when present", () => {
    expect(resolveIdKey({ "CHILD ID": "123", CITY: "Dahlonega" })).toBe(
      "CHILD ID"
    );
  });
  it("falls back to ID for a file using the historical variant name", () => {
    expect(resolveIdKey({ ID: "123", CITY: "Dahlonega" })).toBe("ID");
  });
  it("throws when neither key is present", () => {
    expect(() => resolveIdKey({ CITY: "Dahlonega" })).toThrow();
  });
});

describe("joinByChildId", () => {
  it("matches records across files despite a leading-zero id on one side", () => {
    const registrants = [{ "CHILD ID": "0009218528", "FIRST NAME": "Zoey" }];
    const geocode = [{ "CHILD ID": "9218528", CITY: "Dahlonega" }];
    const result = joinByChildId(registrants, geocode);
    expect(result.matched).toEqual(["9218528"]);
    expect(result.registrantOnly).toEqual([]);
    expect(result.geocodeOnly).toEqual([]);
  });

  it("matches records across the CHILD ID / ID column-name variant", () => {
    const registrants = [{ ID: "9218528", "FIRST NAME": "Zoey" }];
    const geocode = [{ "CHILD ID": "9218528", CITY: "Dahlonega" }];
    const result = joinByChildId(registrants, geocode);
    expect(result.matched).toEqual(["9218528"]);
  });

  it("reports a registrant with no geocode match", () => {
    const registrants = [{ "CHILD ID": "111", "FIRST NAME": "Zoey" }];
    const geocode: Record<string, string>[] = [];
    const result = joinByChildId(registrants, geocode);
    expect(result.registrantOnly).toEqual(["111"]);
    expect(result.matched).toEqual([]);
  });

  it("reports a geocode row with no registrant match", () => {
    const registrants: Record<string, string>[] = [];
    const geocode = [{ "CHILD ID": "222", CITY: "Dahlonega" }];
    const result = joinByChildId(registrants, geocode);
    expect(result.geocodeOnly).toEqual(["222"]);
    expect(result.matched).toEqual([]);
  });
});

const RUN_DATE = new Date("2026-08-15");

describe("buildRegistrantInsert", () => {
  const registrant: Record<string, string> = {
    "CHILD ID": "9218528",
    "PROGRAM PARTNER": "GALUMPKIN",
    "WELCOME BOOK": "Y",
    GRADUATED: "N",
    "LAST NAME": "Hammond",
    "FIRST NAME": "Zoey",
    "MIDDLE INITIAL": "Q",
    "LAST TIME ADDRESS CHANGED": "2026-08-20",
    PHONE: "706-974-4213",
    "PARENT 1 LAST NAME": "Hammond",
    "PARENT 1 FIRST NAME": "Ava",
    "PARENT 2 LAST NAME": "",
    "PARENT 2 FIRST NAME": "",
    "REGISTRATION DATE": "2024-01-01",
    "REGISTRATION TYPE": "Online",
    "BIRTH MONTH": "10",
    "BIRTH DAY": "14",
    "BIRTH YEAR": "2022",
    "BIRTH CODE": "2022-10",
    "ADDITIONAL INFORMATION 1": "Public Library",
    "ADDITIONAL INFORMATION 2": "Text OK",
    "ADDITIONAL INFORMATION 3": "",
    "ADDITIONAL INFORMATION 4": "",
    EMAIL: "zoey.hammond@example.com",
    "AGE GROUP": "3",
    "MONTHS REGISTERED": "12",
    "PROJECTED GRADUATION": "2027-01-01",
    "MONTHS TO GRADUATION": "24",
    "BOOK LANGUAGE": "English",
    "EMAIL COMMUNICATION": "Y",
    "LPP GROUP": "GALUMPKIN-NORTH",
  };
  const geocode: Record<string, string> = {
    "CHILD ID": "9218528",
    ADDRESS: "358 Fortner Dr",
    "ADDRESS 2": "",
    CITY: "Dahlonega",
    STATE: "GA",
    COUNTY: "Lumpkin",
    ZIPCODE: "30533",
    "ZIPCODE+4": "4074",
    "Geocodio Latitude": "34.5327",
    "Geocodio Longitude": "-83.9843",
    "Geocodio Accuracy Score": "0.95",
    "Geocodio Accuracy Type": "rooftop",
  };

  it("drops every DROP/HOLD field — only the explicit STAFF column list appears", () => {
    const result = buildRegistrantInsert("9218528", registrant, geocode, RUN_DATE);
    const forbiddenValues = [
      registrant.PHONE,
      registrant.EMAIL,
      registrant["PARENT 1 FIRST NAME"],
      registrant["BIRTH MONTH"],
      registrant["BIRTH YEAR"],
      registrant["BIRTH CODE"],
      registrant["ADDITIONAL INFORMATION 1"],
    ];
    const producedValues = Object.values(result);
    for (const forbidden of forbiddenValues) {
      expect(producedValues).not.toContain(forbidden);
    }
    expect(Object.keys(result).sort()).toEqual(
      [
        "childId",
        "programPartner",
        "lppGroup",
        "registrationType",
        "registrationDate",
        "welcomeBook",
        "graduated",
        "ageGroup",
        "monthsRegistered",
        "projectedGraduation",
        "monthsToGraduation",
        "bookLanguage",
        "emailCommunication",
        "city",
        "county",
        "state",
        "zipcode",
        "latitude",
        "longitude",
        "geocodeAccuracy",
        "geocodeAccuracyType",
        "addressChangedAt",
        "geocodeStale",
        "blockGroupGeoid",
      ].sort()
    );
  });

  it("flags geocode_stale when the address changed after the geocode run date", () => {
    const result = buildRegistrantInsert("9218528", registrant, geocode, RUN_DATE);
    expect(result.geocodeStale).toBe(true);
  });

  it("does not flag geocode_stale when the address changed before the run date", () => {
    const earlyChange = { ...registrant, "LAST TIME ADDRESS CHANGED": "2024-01-01" };
    const result = buildRegistrantInsert("9218528", earlyChange, geocode, RUN_DATE);
    expect(result.geocodeStale).toBe(false);
  });

  it("survives a missing geocode match with null coordinates rather than being dropped", () => {
    const result = buildRegistrantInsert("9218528", registrant, undefined, RUN_DATE);
    expect(result.childId).toBe("9218528");
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.city).toBeNull();
  });

  it("survives a geocode row with explicitly empty lat/long fields", () => {
    const noCoords = {
      ...geocode,
      "Geocodio Latitude": "",
      "Geocodio Longitude": "",
      "Geocodio Accuracy Score": "",
      "Geocodio Accuracy Type": "",
    };
    const result = buildRegistrantInsert("9218528", registrant, noCoords, RUN_DATE);
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
    expect(result.city).toBe("Dahlonega");
  });
});

describe("buildIdentityInsert", () => {
  it("only carries name and address identity fields", () => {
    const registrant: Record<string, string> = {
      "FIRST NAME": "Zoey",
      "LAST NAME": "Hammond",
      "MIDDLE INITIAL": "Q",
      PHONE: "706-974-4213",
      EMAIL: "zoey.hammond@example.com",
    };
    const geocode: Record<string, string> = {
      ADDRESS: "358 Fortner Dr",
      "ADDRESS 2": "",
      "ZIPCODE+4": "4074",
    };
    const result = buildIdentityInsert("9218528", registrant, geocode);
    expect(Object.keys(result).sort()).toEqual(
      [
        "childId",
        "firstName",
        "lastName",
        "middleInitial",
        "addressLine1",
        "addressLine2",
        "zipcodePlus4",
      ].sort()
    );
    expect(Object.values(result)).not.toContain(registrant.PHONE);
    expect(Object.values(result)).not.toContain(registrant.EMAIL);
  });
});
