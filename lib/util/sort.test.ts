import { describe, expect, it } from "vitest";
import { sortRows } from "./sort";

interface Row {
  id: string;
  value: number | null;
}

describe("sortRows", () => {
  it("sorts ascending by the given column", () => {
    const rows: Row[] = [{ id: "a", value: 3 }, { id: "b", value: 1 }, { id: "c", value: 2 }];
    expect(sortRows(rows, "value", true).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts descending by reversing the comparison, not the array", () => {
    const rows: Row[] = [{ id: "a", value: 3 }, { id: "b", value: 1 }, { id: "c", value: 2 }];
    expect(sortRows(rows, "value", false).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("keeps nulls last in both directions", () => {
    const rows: Row[] = [{ id: "a", value: null }, { id: "b", value: 2 }, { id: "c", value: 1 }];
    expect(sortRows(rows, "value", true).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortRows(rows, "value", false).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const rows: Row[] = [{ id: "a", value: 2 }, { id: "b", value: 1 }];
    const original = [...rows];
    sortRows(rows, "value", true);
    expect(rows).toEqual(original);
  });
});
