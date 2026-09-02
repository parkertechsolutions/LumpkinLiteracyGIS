import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware runs in the Edge runtime, which can't load nodemailer
 * or pg (both need Node.js APIs like `stream` that Edge doesn't support) —
 * so this can't import auth.ts's full NextAuth config, only check for the
 * session cookie's presence.
 *
 * That's a UX-layer redirect, not the security boundary: real role
 * resolution happens server-side in the Node.js runtime on every
 * data-serving route via lib/auth/role.ts's getRole(), which does hit the
 * real database and does reject an expired/forged/missing session. FR-1 is
 * satisfied there, independent of this file.
 */
const PUBLIC_PATHS = ["/sign-in", "/api/auth"];
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(req: NextRequest) {
  const isPublic = PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|geo/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
    "/(api|trpc)(.*)",
  ],
};
