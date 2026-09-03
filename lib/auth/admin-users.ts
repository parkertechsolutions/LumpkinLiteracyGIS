import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { users } from "../db/schema";
import type * as schema from "../db/schema";
import { isValidRole, type Role } from "./role";

/**
 * Admin-only user-management queries — the `users` table itself (Auth.js's
 * account table, `role` is our own column). Separate from lib/data/*, which
 * is registrant data; this is account/access data, a different sensitivity
 * class again from either STAFF or ADMIN registrant fields.
 */
export interface AdminUserRow {
  id: string;
  email: string;
  role: Role | null;
  // "invited": row created, magic-link never completed yet (emailVerified
  // is null until the user actually clicks a sign-in link and it verifies).
  status: "active" | "invited";
}

type AppDb = PgDatabase<any, typeof schema>;

async function resolveDb(db?: AppDb): Promise<AppDb> {
  return db ?? (await import("../db/client")).db;
}

export async function listUsers(db?: AppDb): Promise<AdminUserRow[]> {
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerified: users.emailVerified,
    })
    .from(users);
  return rows
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: isValidRole(r.role) ? r.role : null,
      status: (r.emailVerified ? "active" : "invited") as AdminUserRow["status"],
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function emailInUse(email: string, db?: AppDb): Promise<boolean> {
  const resolvedDb = await resolveDb(db);
  const [row] = await resolvedDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return !!row;
}

/** Creates the invited user's row. This row's existence is itself the
 * invitation — app/sign-in/page.tsx only sends a link to an email with a
 * matching row here. Returns the new row's id. */
export async function createInvitedUser(
  email: string,
  role: Role,
  db?: AppDb
): Promise<string> {
  const resolvedDb = await resolveDb(db);
  const id = randomUUID();
  await resolvedDb.insert(users).values({ id, email, role });
  return id;
}

export async function updateUserRole(id: string, role: Role, db?: AppDb): Promise<void> {
  const resolvedDb = await resolveDb(db);
  await resolvedDb.update(users).set({ role }).where(eq(users.id, id));
}

export async function deleteUser(id: string, db?: AppDb): Promise<void> {
  const resolvedDb = await resolveDb(db);
  await resolvedDb.delete(users).where(eq(users.id, id));
}
