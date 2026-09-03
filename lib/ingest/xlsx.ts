/**
 * Reads the client's single source file, DPData.xlsx, which carries two
 * sheets — "Data" (registrant fields) and "GeoCode Info" (geocode fields) —
 * matching the two spreadsheets PRD.md §2 originally described as separate
 * exports. Output shape (`Record<string, string>[]` keyed by header name)
 * matches what lib/ingest/transform.ts's join/row-shaping functions expect,
 * so nothing downstream of the read needs to know the source was xlsx
 * rather than CSV.
 */
import path from "node:path";
import ExcelJS from "exceljs";

export const DPDATA_PATH = path.join(process.cwd(), "data", "DPData.xlsx");
export const REGISTRANT_SHEET_NAME = "Data";
export const GEOCODE_SHEET_NAME = "GeoCode Info";

// ExcelJS returns typed cell values rather than strings: numbers as numbers,
// dates as Date objects, formulas as { formula, result }, rich text as
// { richText: [...] }. Everything downstream (normalizeId, field/boolField/
// numField in transform.ts) expects a plain string, so every cell is
// normalized here — this is the only place that distinction matters.
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) {
      return cellToString((value as { result: ExcelJS.CellValue }).result);
    }
    if ("richText" in value) {
      return (value as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join("");
    }
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("error" in value) return "";
  }
  return String(value);
}

function sheetToRows(sheet: ExcelJS.Worksheet): Record<string, string>[] {
  const header: string[] = [];
  sheet.getRow(1).eachCell((cell, colNumber) => {
    header[colNumber] = cellToString(cell.value);
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, string> = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = header[colNumber];
      if (!key) return;
      const value = cellToString(cell.value);
      if (value !== "") hasValue = true;
      obj[key] = value;
    });
    if (!hasValue) return;

    // Source sheets sometimes carry a trailing legend/footnote ("KEY: * |
    // Applies to all ...") in the id column, indistinguishable from a data
    // row by position — but a real Child ID never contains a line break, so
    // this is a reliable way to drop it without assuming an id format.
    const idValue = obj["CHILD ID"] ?? obj["ID"];
    if (idValue?.includes("\n")) return;

    rows.push(obj);
  });
  return rows;
}

export async function readXlsxSheet(
  filePath: string,
  sheetName: string
): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in ${filePath}`);
  }
  return sheetToRows(sheet);
}

export async function loadDpDataRows(filePath: string = DPDATA_PATH): Promise<{
  registrantRows: Record<string, string>[];
  geocodeRows: Record<string, string>[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const readSheet = (name: string) => {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Sheet "${name}" not found in ${filePath}`);
    return sheetToRows(sheet);
  };

  return {
    registrantRows: readSheet(REGISTRANT_SHEET_NAME),
    geocodeRows: readSheet(GEOCODE_SHEET_NAME),
  };
}
