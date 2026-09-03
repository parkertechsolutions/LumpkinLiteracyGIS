"use client";

import { useActionState } from "react";
import type { AdminUserRow } from "@/lib/auth/admin-users";
import type { Role } from "@/lib/auth/role";
import { addUserAction, changeRoleAction, deleteUserAction, type ActionState } from "@/app/admin/users/actions";

const ROLES: Role[] = ["viewer", "staff", "admin", "host"];
const INITIAL_STATE: ActionState = {};

export default function AdminUsersTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      <AddUserForm />
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-1.5 pr-2">Email</th>
            <th className="py-1.5 pr-2">Role</th>
            <th className="py-1.5 pr-2">Status</th>
            <th className="py-1.5 pr-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} isSelf={user.id === currentUserId} />
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="text-sm text-gray-500">No users yet.</p>}
    </div>
  );
}

function AddUserForm() {
  const [state, formAction, pending] = useActionState(addUserAction, INITIAL_STATE);
  return (
    <form action={formAction} className="rounded border p-4">
      <h2 className="mb-3 text-sm font-semibold">Invite a user</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-gray-600">
          Email
          <input
            type="email"
            name="email"
            required
            placeholder="name@example.com"
            className="mt-1 rounded border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs text-gray-600">
          Role
          <select name="role" defaultValue="staff" className="mt-1 rounded border px-2 py-1.5 text-sm">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      {state.success && <p className="mt-2 text-xs text-green-700">{state.success}</p>}
    </form>
  );
}

function UserRow({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRoleAction, INITIAL_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteUserAction, INITIAL_STATE);

  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="py-1.5 pr-2">
        {user.email}
        {isSelf && <span className="ml-1 text-xs text-gray-400">(you)</span>}
      </td>
      <td className="py-1.5 pr-2">
        {isSelf ? (
          <span>{user.role ?? "(none)"}</span>
        ) : (
          <form action={roleAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={user.id} />
            <select
              key={user.role}
              name="role"
              defaultValue={user.role ?? "staff"}
              className="rounded border px-1.5 py-1 text-xs"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={rolePending}
              className="rounded bg-gray-200 px-2 py-1 text-xs disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}
        {roleState.error && <p className="mt-1 text-xs text-red-600">{roleState.error}</p>}
      </td>
      <td className="py-1.5 pr-2">
        <span
          className={
            user.status === "active"
              ? "rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
              : "rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800"
          }
        >
          {user.status}
        </span>
      </td>
      <td className="py-1.5 pr-2">
        {!isSelf && (
          <form action={deleteAction}>
            <input type="hidden" name="id" value={user.id} />
            <button
              type="submit"
              disabled={deletePending}
              className="text-xs text-red-600 underline disabled:opacity-50"
              onClick={(e) => {
                if (!confirm(`Delete ${user.email}? This can't be undone.`)) e.preventDefault();
              }}
            >
              Delete
            </button>
          </form>
        )}
        {deleteState.error && <p className="mt-1 text-xs text-red-600">{deleteState.error}</p>}
      </td>
    </tr>
  );
}
