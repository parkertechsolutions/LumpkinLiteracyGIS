/**
 * Four roles — viewer/staff/admin per PRD §5 / ARCHITECTURE.md §4, plus
 * host (added 2026-09-03): the only role that can manage other users'
 * accounts and roles. host and admin otherwise see the same data; "manage
 * users" is deliberately NOT just "roleAtLeast(role, admin)" — it's a
 * one-off capability gated on `role === "host"` specifically (see
 * app/admin/users/actions.ts's requireHostSession) so that admin, despite
 * outranking staff, still cannot touch accounts.
 *
 * An absent or unrecognized role resolves to null (access denied), never to
 * "viewer" — there is no default role for a new account.
 */
export type Role = "viewer" | "staff" | "admin" | "host";
const VALID_ROLES: readonly Role[] = ["viewer", "staff", "admin", "host"];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (VALID_ROLES as readonly string[]).includes(value);
}

/** True if `role` is at least as privileged as `min` (viewer < staff < admin). */
export function roleAtLeast(role: Role, min: Role): boolean {
  return VALID_ROLES.indexOf(role) >= VALID_ROLES.indexOf(min);
}

/**
 * Resolves the caller's role from the Auth.js session, server-side, on
 * every call — never from anything the client sends. The role itself lives
 * in our own `users.role` column (auth.ts's session callback copies it onto
 * the session) and is assigned by direct database update, not self-service.
 */
export async function getRole(): Promise<Role | null> {
  // Imported lazily to avoid a require cycle: auth.ts imports isValidRole
  // from this module for its session callback.
  const { auth } = await import("@/auth");
  const session = await auth();
  return session?.user.role ?? null;
}
