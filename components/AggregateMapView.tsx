"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl, LngLatBounds, Popup, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DEFAULT_CENTER: [number, number] = [-83.9843, 34.5327];
const DEFAULT_ZOOM = 10;

// Sequential blue ramp, dataviz skill reference palette (palette.md).
const RAMP: [number, string][] = [
  [5, "#cde2fb"],
  [10, "#86b6ef"],
  [25, "#3987e5"],
  [50, "#1c5cab"],
  [100, "#0d366b"],
];

const COUNTY_NAMES: Record<string, string> = {
  "13187": "Lumpkin",
  "13085": "Dawson",
  "13311": "White",
  "13291": "Union",
  "13139": "Hall",
};

/**
 * Viewer role: block-group counts only, per FR-6/FR-7 — no individual
 * points are ever fetched or reachable here. This component has no click
 * handler that could expose a record, no clustering, no draw tool, no
 * dashboard — those are Staff/Admin features backed by /api/points, a
 * route this role can't call.
 */
export default function AggregateMapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [areaCount, setAreaCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), "top-right");

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", async () => {
      let geojson: GeoJSON.FeatureCollection;
      try {
        const res = await fetch("/api/aggregate");
        if (!res.ok) throw new Error(`/api/aggregate returned ${res.status}`);
        geojson = (await res.json()) as GeoJSON.FeatureCollection;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load aggregate data");
        return;
      }

      setAreaCount(geojson.features.length);

      map.addSource("aggregate", { type: "geojson", data: geojson });
      map.addLayer({
        id: "aggregate-fill",
        type: "fill",
        source: "aggregate",
        paint: {
          "fill-color": [
            "step",
            ["get", "count"],
            RAMP[0]![1],
            RAMP[0]![0],
            RAMP[1]![1],
            RAMP[1]![0],
            RAMP[2]![1],
            RAMP[2]![0],
            RAMP[3]![1],
            RAMP[3]![0],
            RAMP[4]![1],
          ],
          "fill-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "aggregate-line",
        type: "line",
        source: "aggregate",
        paint: { "line-color": "#ffffff", "line-width": 0.5 },
      });

      const bounds = new LngLatBounds();
      for (const f of geojson.features) {
        if (f.geometry.type !== "Polygon") continue;
        for (const ring of f.geometry.coordinates) {
          for (const pos of ring) bounds.extend([pos[0]!, pos[1]!]);
        }
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 12 });

      map.on("click", "aggregate-fill", (e: MapLayerMouseEvent) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const county = COUNTY_NAMES[String(props.GEOID).slice(0, 5)] ?? "Unknown county";
        new Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<strong>${county}</strong><br/>${props.count} registrants`)
          .addTo(map);
      });
      map.on("mouseenter", "aggregate-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "aggregate-fill", () => (map.getCanvas().style.cursor = ""));
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-screen w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-3 top-3 z-10 rounded bg-white/90 px-3 py-2 text-xs shadow">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : areaCount === null ? (
          <span>Loading coverage map…</span>
        ) : (
          <div className="space-y-1">
            <div>{areaCount} areas shown (areas under 5 registrants are suppressed)</div>
            <div className="flex items-center gap-2">
              {RAMP.map(([threshold, color]) => (
                <span key={threshold} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {threshold}+
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
