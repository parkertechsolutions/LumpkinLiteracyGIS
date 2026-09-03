import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { accessLog, registrantIdentity } from "../db/schema";
import type * as schema from "../db/schema";

/**
 * Admin/Host-only, single-record identity lookup — FR-15/16 in PRD.md,
 * ADMIN disposition in DATA_DICTIONARY.md. Deliberately NOT a bulk query:
 * one childId in, one record's identity fields out, logged every time.
 * Staff never reaches this module at all. Address (line 1/2) moved to
 * MapPoint/registrants on 2026-09-03 — it's STAFF-visible now, so it's no
 * longer part of what needs revealing; only ZIP+4 stays here as the
 * remaining ADMIN-only address precision.
 */
export interface RevealedIdentity {
  childId: string;
  firstName: string | null;
  lastName: string | null;
  middleInitial: string | null;
  zipcodePlus4: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  birthYear: number | null;
  phone: string | null;
  parent1FirstName: string | null;
  parent1LastName: string | null;
  parent2FirstName: string | null;
  parent2LastName: string | null;
}

type AppDb = PgDatabase<any, typeof schema>;

/**
 * FR-17: "Every reveal writes an access log entry before the data is
 * returned. If the log write fails, the reveal fails." — the log insert and
 * the identity select run in the same transaction, so there is never a
 * returned reveal without a matching audit row, and a failed log write
 * rolls back the whole request rather than silently returning data. Logs
 * every attempt, including one for a childId that doesn't exist — a
 * mistyped or probing lookup is itself audit-worthy.
 */
export async function revealIdentity(
  childId: string,
  actor: { userId: string; userEmail: string },
  db?: AppDb
): Promise<RevealedIdentity | null> {
  const resolvedDb = db ?? (await import("../db/client")).db;
  return resolvedDb.transaction(async (tx) => {
    await tx.insert(accessLog).values({
      userId: actor.userId,
      userEmail: actor.userEmail,
      action: "reveal_identity",
      childId,
    });
    const [row] = await tx
      .select({
        childId: registrantIdentity.childId,
        firstName: registrantIdentity.firstName,
        lastName: registrantIdentity.lastName,
        middleInitial: registrantIdentity.middleInitial,
        zipcodePlus4: registrantIdentity.zipcodePlus4,
        birthMonth: registrantIdentity.birthMonth,
        birthDay: registrantIdentity.birthDay,
        birthYear: registrantIdentity.birthYear,
        phone: registrantIdentity.phone,
        parent1FirstName: registrantIdentity.parent1FirstName,
        parent1LastName: registrantIdentity.parent1LastName,
        parent2FirstName: registrantIdentity.parent2FirstName,
        parent2LastName: registrantIdentity.parent2LastName,
      })
      .from(registrantIdentity)
      .where(eq(registrantIdentity.childId, childId));
    return row ?? null;
  });
}
