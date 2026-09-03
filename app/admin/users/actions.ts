"use server";

import { revalidatePath } from "next/cache";
import { auth, signIn } from "@/auth";
import { isValidRole } from "@/lib/auth/role";
import {
  createInvitedUser,
  deleteUser,
  emailInUse,
  updateUserRole,
} from "@/lib/auth/admin-users";

export interface ActionState {
  error?: string;
  success?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** User management is host-only — deliberately not roleAtLeast(role,
 * "admin"). admin outranks staff but does NOT get this capability; only
 * host does. Every action re-checks this itself, independent of the page's
 * own check — a server action is a public endpoint in its own right and
 * must never trust that only the admin page's UI can invoke it. Returns the
 * session so callers also get the caller's own id for self-action guards. */
async function requireHostSession() {
  const session = await auth();
  if (session?.user.role !== "host") {
    throw new Error("Forbidden");
  }
  return session;
}

function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().toLowerCase();
}

// FR-2: accounts are invitation-only. Creating the row *is* the invitation
// (app/sign-in/page.tsx only emails an address with a matching row) — this
// action also fires that email immediately, via the same Auth.js email
// provider a self-service sign-in would use, rather than waiting for the
// invitee to find /sign-in themselves.
export async function addUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireHostSession();

  const email = normalizeEmail(formData.get("email"));
  const role = String(formData.get("role") ?? "");

  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!isValidRole(role)) {
    return { error: "Choose a role." };
  }
  if (await emailInUse(email)) {
    return { error: `${email} already has an account — use the role control below to change it.` };
  }

  await createInvitedUser(email, role);
  revalidatePath("/admin/users");

  let sendError: string | null = null;
  try {
    const result = await signIn("nodemailer", { email, redirect: false, redirectTo: "/" });
    const errorParam = new URL(result).searchParams.get("error");
    if (errorParam) sendError = errorParam;
  } catch (err) {
    sendError = err instanceof Error ? err.message : "unknown error";
  }

  if (sendError) {
    return {
      success: `${email} added as ${role}, but the invite email failed to send (${sendError}). They can still sign in at /sign-in once that's fixed.`,
    };
  }
  return { success: `Invite sent to ${email} as ${role}.` };
}

export async function changeRoleAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireHostSession();

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isValidRole(role)) {
    return { error: "Invalid role." };
  }
  if (id === session.user.id) {
    return { error: "You can't change your own role — ask another host." };
  }

  await updateUserRole(id, role);
  revalidatePath("/admin/users");
  return { success: "Role updated." };
}

export async function deleteUserAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireHostSession();

  const id = String(formData.get("id") ?? "");
  if (id === session.user.id) {
    return { error: "You can't delete your own account — ask another host." };
  }

  await deleteUser(id);
  revalidatePath("/admin/users");
  return { success: "User deleted." };
}
