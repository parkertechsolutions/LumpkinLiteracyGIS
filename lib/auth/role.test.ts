import { describe, expect, it } from "vitest";
import { isValidRole, roleAtLeast } from "./role";

describe("isValidRole", () => {
  it("accepts the three defined roles", () => {
    expect(isValidRole("viewer")).toBe(true);
    expect(isValidRole("staff")).toBe(true);
    expect(isValidRole("admin")).toBe(true);
  });
  it("rejects anything else, including a forged role from a request body", () => {
    expect(isValidRole("superadmin")).toBe(false);
    expect(isValidRole("")).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(0)).toBe(false);
    expect(isValidRole({ role: "admin" })).toBe(false);
  });
});

describe("roleAtLeast", () => {
  it("orders viewer < staff < admin", () => {
    expect(roleAtLeast("admin", "viewer")).toBe(true);
    expect(roleAtLeast("admin", "staff")).toBe(true);
    expect(roleAtLeast("staff", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "staff")).toBe(false);
    expect(roleAtLeast("staff", "admin")).toBe(false);
  });
  it("treats equal roles as satisfying the minimum", () => {
    expect(roleAtLeast("staff", "staff")).toBe(true);
  });
});
