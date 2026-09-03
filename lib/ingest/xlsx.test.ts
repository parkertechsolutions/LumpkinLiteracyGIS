import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cellToString, loadDpDataRows, readXlsxSheet } from "./xlsx";

// Builds a small in-memory workbook covering the cell types DPData.xlsx
// actually contains — plain text, a numeric id, a Y/N flag, a real Date
// cell, and a formula cell — so cellToString's per-type handling is
// exercised without depending on the real data file.
let dir: string;
let filePath: string;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "dpdata-test-"));
  filePath = path.join(dir, "fixture.xlsx");

  const workbook = new ExcelJS.Workbook();
  const data = workbook.addWorksheet("Data");
  data.addRow(["CHILD ID", "WELCOME BOOK", "REGISTRATION DATE", "EMAIL"]);
  data.addRow([9218528, "Y", new Date("2024-03-19T00:00:00.000Z")]);
  data.getCell(2, 4).value = {
    formula: 'LOWER("Zoey")&"@example.com"',
    result: "zoey@example.com",
  };

  const geo = workbook.addWorksheet("GeoCode Info");
  geo.addRow(["CHILD ID", "CITY"]);
  geo.addRow([9218528, "Dahlonega"]);

  await workbook.xlsx.writeFile(filePath);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readXlsxSheet", () => {
  it("converts a numeric cell to a string", async () => {
    const rows = await readXlsxSheet(filePath, "Data");
    expect(rows[0]!["CHILD ID"]).toBe("9218528");
  });

  it("passes a Y/N flag through unchanged for boolField", async () => {
    const rows = await readXlsxSheet(filePath, "Data");
    expect(rows[0]!["WELCOME BOOK"]).toBe("Y");
  });

  it("converts a Date cell to an ISO date string", async () => {
    const rows = await readXlsxSheet(filePath, "Data");
    expect(rows[0]!["REGISTRATION DATE"]).toBe("2024-03-19");
  });

  it("resolves a formula cell to its computed result", async () => {
    const rows = await readXlsxSheet(filePath, "Data");
    expect(rows[0]!["EMAIL"]).toBe("zoey@example.com");
  });

  it("throws when the sheet name doesn't exist", async () => {
    await expect(readXlsxSheet(filePath, "Nope")).rejects.toThrow(/Sheet "Nope" not found/);
  });
});

// ExcelJS's writer can't produce a shared-formula-without-cached-result cell
// (workbook.xlsx.writeFile throws on it), even though its reader happily
// returns that exact shape from a real file — DPData.xlsx's AGE GROUP
// column (computed as YEAR(TODAY())-BIRTH YEAR) has it for ~8% of rows,
// wherever the generating tool didn't cache a shared formula's result.
// Exercised directly against cellToString rather than a fixture round-trip.
describe("cellToString", () => {
  it("converts an uncached shared-formula cell to an empty string, not '[object Object]'", () => {
    expect(cellToString({ sharedFormula: "Y1" } as unknown as ExcelJS.CellValue)).toBe("");
  });

  it("converts a master formula cell with no cached result to an empty string", () => {
    expect(
      cellToString({
        formula: "YEAR(TODAY())-R25",
        ref: "Y25:Y88",
        shareType: "shared",
      } as unknown as ExcelJS.CellValue)
    ).toBe("");
  });
});

describe("loadDpDataRows", () => {
  it("reads both the Data and GeoCode Info sheets from one file", async () => {
    const { registrantRows, geocodeRows } = await loadDpDataRows(filePath);
    expect(registrantRows).toHaveLength(1);
    expect(geocodeRows).toHaveLength(1);
    expect(registrantRows[0]!["CHILD ID"]).toBe("9218528");
    expect(geocodeRows[0]!["CITY"]).toBe("Dahlonega");
  });
});
