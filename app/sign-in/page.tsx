import { signIn } from "@/auth";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// FR-4: email magic link, no password. FR-2: accounts are invite-only — an
// admin creates the user row (with a role) directly in the database first;
// that row's existence *is* the invitation. Only an email with an existing
// row ever gets a link sent. An unrecognized email gets the same "check
// your email" response either way, so this can't be used to enumerate
// which addresses are registered.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        action={async (formData) => {
          "use server";
          const email = String(formData.get("email") ?? "")
            .trim()
            .toLowerCase();
          const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (existing) {
            await signIn("nodemailer", formData);
          } else {
            redirect("/sign-in/check-email");
          }
        }}
        className="w-full max-w-sm space-y-4 rounded border p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-gray-600">
          Enter your email and we&apos;ll send you a sign-in link.
        </p>
        <input
          type="email"
          name="email"
          required
          placeholder="you@example.com"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button type="submit" className="w-full rounded bg-blue-600 px-3 py-2 text-sm text-white">
          Send link
        </button>
      </form>
    </main>
  );
}
