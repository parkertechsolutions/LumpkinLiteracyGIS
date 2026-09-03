import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-helpers";
import { accessLog, registrantIdentity } from "../db/schema";
import { revealIdentity } from "./reveal";

let client: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];
const ACTOR = { userId: "admin-1", userEmail: "admin@example.com" };

beforeAll(async () => {
  const testDb = await createTestDb();
  client = testDb.client;
  db = testDb.db;
});

afterAll(async () => {
  await client.close();
});

describe("revealIdentity", () => {
  it("returns the identity fields for an existing childId", async () => {
    const [anyIdentity] = await db.select().from(registrantIdentity).limit(1);
    const childId = anyIdentity!.childId;

    const result = await revealIdentity(childId, ACTOR, db);
    expect(result).not.toBeNull();
    expect(result!.childId).toBe(childId);
    expect(result!.firstName).toBe(anyIdentity!.firstName);
    expect(result!.zipcodePlus4).toBe(anyIdentity!.zipcodePlus4);
    expect(result!.phone).toBe(anyIdentity!.phone);
    expect(result!.parent1FirstName).toBe(anyIdentity!.parent1FirstName);
    expect(result!.birthYear).toBe(anyIdentity!.birthYear);
  });

  it("writes an access_log entry for the reveal", async () => {
    const [anyIdentity] = await db.select().from(registrantIdentity).limit(1);
    const childId = anyIdentity!.childId;

    const before = await db.select().from(accessLog).where(eq(accessLog.childId, childId));
    await revealIdentity(childId, ACTOR, db);
    const after = await db.select().from(accessLog).where(eq(accessLog.childId, childId));

    expect(after.length).toBe(before.length + 1);
    const entry = after[after.length - 1]!;
    expect(entry.action).toBe("reveal_identity");
    expect(entry.userId).toBe(ACTOR.userId);
    expect(entry.userEmail).toBe(ACTOR.userEmail);
    expect(entry.childId).toBe(childId);
  });

  it("returns null for a childId with no identity row, but still logs the attempt", async () => {
    const before = await db.select().from(accessLog).where(eq(accessLog.childId, "no-such-child"));
    const result = await revealIdentity("no-such-child", ACTOR, db);
    const after = await db.select().from(accessLog).where(eq(accessLog.childId, "no-such-child"));

    expect(result).toBeNull();
    expect(after.length).toBe(before.length + 1);
  });
});
