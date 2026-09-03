import Link from "next/link";
import { redirect } from "next/navigation";
import MapView from "@/components/MapView";
import AggregateMapView from "@/components/AggregateMapView";
import { getRole } from "@/lib/auth/role";

export default async function MapPage() {
  const role = await getRole();
  if (!role) redirect("/access-denied"); // FR-3: no role, no default view.
  return (
    <>
      {role === "host" && (
        <Link
          href="/admin/users"
          className="fixed bottom-3 right-3 z-20 rounded bg-white/90 px-3 py-1.5 text-xs shadow hover:bg-white"
        >
          Admin
        </Link>
      )}
      {role === "viewer" ? <AggregateMapView /> : <MapView role={role} />}
    </>
  );
}
