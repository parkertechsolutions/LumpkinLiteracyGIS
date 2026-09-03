import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getRole } from "@/lib/auth/role";
import { listUsers } from "@/lib/auth/admin-users";
import AdminUsersTable from "@/components/AdminUsersTable";

// Host only — deliberately not "admin or above": admin sees the same data
// host does but does not get to manage accounts. Role assignment is the
// most sensitive control surface in the app (it decides who can see
// identified minors' data at all), so this is checked the same way every
// data route checks it: server-side, from the session, on every load. No
// client-side gate.
export default async function AdminUsersPage() {
  const role = await getRole();
  if (role !== "host") redirect("/access-denied");

  const session = await auth();
  const users = await listUsers();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-gray-500">
            Add, change, or remove accounts and their role. Adding a user emails them a
            sign-in link immediately.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-blue-600 underline">
            Back to map
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button type="submit" className="text-gray-500 underline">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <AdminUsersTable users={users} currentUserId={session!.user.id} />
    </main>
  );
}
