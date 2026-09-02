import { signOut } from "@/auth";

// FR-3: an account with no assigned role sees this, not a default view.
export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="max-w-sm text-sm text-gray-600">
        Your account is signed in but has not been assigned a role. Contact your
        administrator to request access.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="rounded bg-gray-200 px-4 py-2 text-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
