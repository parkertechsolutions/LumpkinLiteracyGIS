import NextAuth, { type DefaultSession } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { isValidRole, type Role } from "@/lib/auth/role";

/**
 * Auth.js v5 (Postgres-backed, email magic link — FR-4). Requires a
 * database session strategy: the Nodemailer/Email provider stores a
 * short-lived verification token that has to be looked up when the link is
 * clicked, which a JWT-only session can't do.
 *
 * Needs, at runtime: DATABASE_URL (already required by lib/db/client.ts),
 * AUTH_SECRET, and SMTP credentials (EMAIL_SERVER_*, EMAIL_FROM) to actually
 * send the magic-link email. See .env.example.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
  },
  callbacks: {
    // The session's role always comes from what's in the database for this
    // user — never from anything the client could have sent.
    session({ session, user }) {
      const role = (user as { role?: unknown }).role;
      session.user.role = isValidRole(role) ? role : null;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      // Not in DefaultSession["user"], but the database-session flow always
      // populates it (@auth/core spreads the full adapter user, id
      // included, into session.user before our callback runs).
      id: string;
      role: Role | null;
    } & DefaultSession["user"];
  }
}
