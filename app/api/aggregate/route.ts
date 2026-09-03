import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth/role";
import { loadAggregateGeoJson } from "@/lib/data/aggregate";

// viewer, staff, admin — all roles per ARCHITECTURE.md §4's route table.
export async function GET() {
  const role = await getRole();
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const geojson = await loadAggregateGeoJson();
  return NextResponse.json(geojson, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
