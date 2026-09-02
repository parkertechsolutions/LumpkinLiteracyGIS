/**
 * Even-odd ray-casting point-in-polygon test, supporting GeoJSON Polygon and
 * MultiPolygon geometries with holes (interior rings). No dependency — the
 * boundary count here (188 block groups) doesn't need a spatial index.
 */
type Ring = [number, number][]; // [lon, lat] pairs, GeoJSON order
type PolygonCoords = Ring[]; // first ring is exterior, rest are holes
type MultiPolygonCoords = PolygonCoords[];

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    const xi = pi[0];
    const yi = pi[1];
    const xj = pj[0];
    const yj = pj[1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lon: number, lat: number, polygon: PolygonCoords): boolean {
  const [exterior, ...holes] = polygon;
  if (!exterior || !pointInRing(lon, lat, exterior)) return false;
  for (const hole of holes) {
    if (pointInRing(lon, lat, hole)) return false;
  }
  return true;
}

export function pointInGeometry(
  lon: number,
  lat: number,
  geometry: { type: "Polygon"; coordinates: PolygonCoords } | { type: "MultiPolygon"; coordinates: MultiPolygonCoords }
): boolean {
  if (geometry.type === "Polygon") {
    return pointInPolygonCoords(lon, lat, geometry.coordinates);
  }
  return geometry.coordinates.some((poly) => pointInPolygonCoords(lon, lat, poly));
}
