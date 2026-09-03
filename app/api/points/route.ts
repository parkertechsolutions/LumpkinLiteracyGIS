import { NextResponse } from "next/server";
import { getRole, roleAtLeast } from "@/lib/auth/role";
import { loadMapPoints } from "@/lib/data/points";

// staff, admin — per ARCHITECTURE.md §4's route table. A Viewer session
// (or no role at all) gets 403, not a filtered response — the aggregate
// endpoint is the Viewer's route, not a smaller version of this one.
export async function GET() {
  const role = await getRole();
  if (!role || !roleAtLeast(role, "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const points = await loadMapPoints();
  return NextResponse.json(points, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
