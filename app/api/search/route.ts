import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth/role";
import { searchByName } from "@/lib/data/search";

// admin, host only — name stays ADMIN disposition, same boundary as
// /api/reveal. Child ID and address search are STAFF-disposition data and
// happen entirely client-side in MapView instead (see lib/data/search.ts).
// Query text travels in the POST body, not a URL/query string (NFR-4).
// Returns matching childIds only, never name text — see lib/data/search.ts.
export async function POST(request: Request) {
  const role = await getRole();
  if (role !== "admin" && role !== "host") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const type = body?.type;
  const query = typeof body?.query === "string" ? body.query : "";

  if (type !== "name") {
    return NextResponse.json({ error: "type must be 'name'" }, { status: 400 });
  }

  const childIds = await searchByName(query);
  return NextResponse.json({ childIds }, { headers: { "Cache-Control": "private, no-store" } });
}
