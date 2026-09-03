import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMigratedDb } from "../db/test-helpers";
import * as schema from "../db/schema";
import {
  createInvitedUser,
  deleteUser,
  emailInUse,
  listUsers,
  updateUserRole,
} from "./admin-users";

let client: PGlite;
let db: Awaited<ReturnType<typeof createMigratedDb>>["db"];

beforeAll(async () => {
  const testDb = await createMigratedDb();
  client = testDb.client;
  db = testDb.db;
});

afterEach(async () => {
  await db.delete(schema.users);
});

afterAll(async () => {
  await client.close();
});

describe("createInvitedUser / listUsers", () => {
  it("creates a row that shows up as invited (unverified) until sign-in completes", async () => {
    await createInvitedUser("new.staff@example.com", "staff", db);
    const rows = await listUsers(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "new.staff@example.com",
      role: "staff",
      status: "invited",
    });
  });

  it("sorts by email", async () => {
    await createInvitedUser("zed@example.com", "viewer", db);
    await createInvitedUser("amy@example.com", "viewer", db);
    const rows = await listUsers(db);
    expect(rows.map((r) => r.email)).toEqual(["amy@example.com", "zed@example.com"]);
  });
});

describe("emailInUse", () => {
  it("is false for an email with no row", async () => {
    expect(await emailInUse("nobody@example.com", db)).toBe(false);
  });

  it("is true once a row exists", async () => {
    await createInvitedUser("present@example.com", "staff", db);
    expect(await emailInUse("present@example.com", db)).toBe(true);
  });
});

describe("updateUserRole", () => {
  it("changes the role of the matching row only", async () => {
    const targetId = await createInvitedUser("target@example.com", "viewer", db);
    await createInvitedUser("other@example.com", "viewer", db);

    await updateUserRole(targetId, "admin", db);

    const rows = await listUsers(db);
    expect(rows.find((r) => r.email === "target@example.com")?.role).toBe("admin");
    expect(rows.find((r) => r.email === "other@example.com")?.role).toBe("viewer");
  });
});

describe("deleteUser", () => {
  it("removes the row", async () => {
    const id = await createInvitedUser("gone@example.com", "staff", db);
    await deleteUser(id, db);
    expect(await listUsers(db)).toHaveLength(0);
  });
});
