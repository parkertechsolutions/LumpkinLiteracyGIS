import { redirect } from "next/navigation";
import MapView from "@/components/MapView";
import AggregateMapView from "@/components/AggregateMapView";
import { getRole } from "@/lib/auth/role";

export default async function MapPage() {
  const role = await getRole();
  if (!role) redirect("/access-denied"); // FR-3: no role, no default view.
  if (role === "viewer") return <AggregateMapView />;
  return <MapView />; // staff, admin
}
