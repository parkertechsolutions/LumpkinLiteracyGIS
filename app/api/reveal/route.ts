import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRole } from "@/lib/auth/role";
import { revealIdentity } from "@/lib/data/reveal";

// admin, host only — per DATA_DICTIONARY.md's 2026-09-03 update. Staff can
// never reach this route. childId travels in the POST body, never a URL or
// query string (NFR-4 / CLAUDE.md rule 6 — no registrant identifier in a
// path segment or query string).
export async function POST(request: Request) {
  const role = await getRole();
  if (role !== "admin" && role !== "host") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  const identity = await revealIdentity(childId, {
    userId: session.user.id,
    userEmail: session.user.email ?? "",
  });
  if (!identity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(identity, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
