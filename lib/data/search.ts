import { ilike, or, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { registrantIdentity } from "../db/schema";
import type * as schema from "../db/schema";

/**
 * Name search — host and admin only (name stays ADMIN disposition). Child
 * ID and address search are both plain STAFF-disposition data now (address
 * was promoted from ADMIN on 2026-09-03) and stay entirely client-side in
 * MapView, no server round trip or role gate beyond "has the map at all."
 *
 * Deliberately returns matching childIds only, never the name text that
 * matched — per the 2026-09-03 decision, actually seeing the PII that
 * matched still goes through the logged single-record reveal endpoint
 * (lib/data/reveal.ts). A search box that printed name results directly
 * would just be bulk PII browsing with extra steps.
 */
type AppDb = PgDatabase<any, typeof schema>;

async function resolveDb(db?: AppDb): Promise<AppDb> {
  return db ?? (await import("../db/client")).db;
}

// A bare "*" wildcard in the user's query becomes SQL's "%"; a query with
// no wildcard of its own is still treated as a partial match by wrapping it
// in "%...%". Postgres's own "%"/"_" are escaped first so a literal percent
// sign in someone's search text can't be mistaken for a wildcard.
function toIlikePattern(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
  const withWildcards = escaped.replace(/\*/g, "%");
  return withWildcards.includes("%") ? withWildcards : `%${withWildcards}%`;
}

export async function searchByName(query: string, db?: AppDb): Promise<string[]> {
  const pattern = toIlikePattern(query);
  if (!pattern) return [];
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({ childId: registrantIdentity.childId })
    .from(registrantIdentity)
    .where(
      or(
        ilike(registrantIdentity.firstName, pattern),
        ilike(registrantIdentity.lastName, pattern),
        ilike(
          sql`(${registrantIdentity.firstName} || ' ' || ${registrantIdentity.lastName})`,
          pattern
        )
      )
    );
  return rows.map((r) => r.childId);
}
