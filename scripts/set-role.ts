/**
 * Assigns a role to a user by email, creating the row if it doesn't exist
 * yet. This *is* the invitation mechanism per PRD §5 — role assignment is
 * manual and explicit, never self-service, and this script is the manual
 * step. Also directly enforces app/sign-in/page.tsx's invite-only gate:
 * only an email with a row here (any role) can receive a sign-in link.
 *
 * Run: npm run set-role -- someone@example.com admin
 */
import { randomUUID } from "node:crypto";
import { db } from "../lib/db/client";
import { users } from "../lib/db/schema";
import { isValidRole } from "../lib/auth/role";

async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !isValidRole(role)) {
    console.error("Usage: npm run set-role -- <email> <viewer|staff|admin>");
    process.exitCode = 1;
    return;
  }

  await db
    .insert(users)
    .values({ id: randomUUID(), email, role })
    .onConflictDoUpdate({ target: users.email, set: { role } });
  console.log(`${email} -> role=${role}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
