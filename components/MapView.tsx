"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  LngLatBounds,
  Popup,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapPoint } from "@/lib/data/points";
import { pointInGeometry } from "@/lib/geo/point-in-polygon";
import Dashboard, { pointMatchesFilters, type FilterDimension, type FilterState } from "./Dashboard";
import { sortRows } from "@/lib/util/sort";

// Carto's free vector basemap — no API key required, but ARCHITECTURE.md §8
// flags basemap provider/attribution terms as an open decision to confirm
// before client handoff. This is a development choice, not a final one.
// Esri World Imagery and USGS Shaded Relief are likewise free/no-key
// providers chosen for the same reason — same open question applies to them.
const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const AERIAL_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const HILLSHADE_TILE_URL =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_CENTER: [number, number] = [-83.9843, 34.5327]; // Dahlonega
const DEFAULT_ZOOM = 10;

const ACCURACY_COLORS: Record<string, string> = {
  rooftop: "#1a9850",
  range_interpolation: "#91cf60",
  street_center: "#fee08b",
  place: "#fc8d59",
  unknown: "#999999",
};

type OverlayKey =
  | "countyLimits"
  | "cityLimits"
  | "roads"
  | "aerial"
  | "topography"
  | "nationalForest"
  | "schoolDistricts"
  | "zipCodes"
  | "libraries";
const OVERLAY_LABELS: Record<OverlayKey, string> = {
  countyLimits: "County limits",
  cityLimits: "City limits",
  roads: "Roads",
  aerial: "Aerial imagery",
  topography: "Topography",
  nationalForest: "National forest",
  schoolDistricts: "School districts",
  zipCodes: "ZIP codes",
  libraries: "Public libraries",
};
// Roads ride on the basemap's own vector layers rather than a separate
// fetch — toggled off, this hides every road/rail line and label the Carto
// style draws.
const ROAD_SOURCE_LAYERS = new Set(["transportation", "transportation_name"]);

// Lazy-loaded boundary sources: geojson URL to fetch, fetched once, the
// first time the matching overlay is switched on.
const BOUNDARY_SOURCE_URLS: Partial<Record<OverlayKey, string>> = {
  countyLimits: "/geo/county-limits.geojson",
  cityLimits: "/geo/city-limits.geojson",
  nationalForest: "/geo/national-forest.geojson",
  schoolDistricts: "/geo/school-districts.geojson",
  zipCodes: "/geo/zip-codes.geojson",
  libraries: "/geo/libraries.geojson",
};
const BOUNDARY_SOURCE_IDS: Partial<Record<OverlayKey, string>> = {
  countyLimits: "county-limits",
  cityLimits: "city-limits",
  nationalForest: "national-forest",
  schoolDistricts: "school-districts",
  zipCodes: "zip-codes",
  libraries: "libraries",
};

function toFeatureCollection(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude!, p.latitude!] },
        properties: {
          childId: p.childId,
          programPartner: p.programPartner,
          ageGroup: p.ageGroup,
          monthsRegistered: p.monthsRegistered,
          projectedGraduation: p.projectedGraduation,
          monthsToGraduation: p.monthsToGraduation,
          bookLanguage: p.bookLanguage,
          graduated: p.graduated,
          welcomeBook: p.welcomeBook,
          city: p.city,
          county: p.county,
          zipcode: p.zipcode,
          geocodeAccuracyType: p.geocodeAccuracyType ?? "unknown",
          geocodeStale: p.geocodeStale ?? false,
        },
      })),
  };
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [selected, setSelected] = useState<GeoJSON.GeoJsonProperties | null>(null);
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [missingCoordCount, setMissingCoordCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layersReady, setLayersReady] = useState(false);
  const [overlays, setOverlays] = useState<Record<OverlayKey, boolean>>({
    countyLimits: false,
    cityLimits: false,
    roads: true,
    aerial: false,
    topography: false,
    nationalForest: false,
    schoolDistricts: false,
    zipCodes: false,
    libraries: false,
  });
  const [allPoints, setAllPoints] = useState<MapPoint[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const drawModeRef = useRef(false);
  const loadedBoundariesRef = useRef<Set<OverlayKey>>(new Set());
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [selectedRows, setSelectedRows] = useState<MapPoint[] | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});
  const [sortColumn, setSortColumn] = useState<keyof MapPoint>("childId");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  const filteredPoints = useMemo(
    () => allPoints.filter((p) => pointMatchesFilters(p, filters)),
    [allPoints, filters]
  );

  const sortedSelectedRows = useMemo(
    () => (selectedRows ? sortRows(selectedRows, sortColumn, sortAsc) : null),
    [selectedRows, sortColumn, sortAsc]
  );

  function toggleSort(column: keyof MapPoint) {
    if (column === sortColumn) setSortAsc((prev) => !prev);
    else {
      setSortColumn(column);
      setSortAsc(true);
    }
  }

  function toggleFilter(dimension: FilterDimension, value: string) {
    setFilters((prev) => {
      const next = { ...prev };
      const set = new Set(next[dimension] ?? []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      if (set.size === 0) delete next[dimension];
      else next[dimension] = set;
      return next;
    });
  }
  function clearFilters() {
    setFilters({});
  }

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

    // If the container's CSS (Tailwind's h-screen/h-full) hasn't applied
    // yet at construction time, MapLibre initializes against a 0x0 canvas
    // and never recovers on its own once the container actually gets its
    // real size — nothing else triggers a recalculation. A ResizeObserver
    // catches that and nudges it.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("load", async () => {
      // Raster overlays first, right above the base fill and below every
      // vector layer (roads/labels stay legible drawn over imagery). Insert
      // right after the first layer (the base fill) rather than a specific
      // named layer, since that name is style-specific.
      const firstLayerId = map.getStyle().layers?.[1]?.id;
      map.addSource("aerial", { type: "raster", tiles: [AERIAL_TILE_URL], tileSize: 256 });
      map.addLayer(
        { id: "aerial", type: "raster", source: "aerial", layout: { visibility: "none" } },
        firstLayerId
      );
      map.addSource("topography", { type: "raster", tiles: [HILLSHADE_TILE_URL], tileSize: 256 });
      map.addLayer(
        { id: "topography", type: "raster", source: "topography", layout: { visibility: "none" } },
        firstLayerId
      );

      // Boundary overlays — sources start empty. Nobody pays for ~7.6MB of
      // county/city/school-district/zip/library data on page load; each one
      // is fetched lazily in toggleOverlay() the first time its checkbox is
      // actually turned on.
      const emptyFC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
      map.addSource("county-limits", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "county-limits",
        type: "line",
        source: "county-limits",
        layout: { visibility: "none" },
        paint: { "line-color": "#555555", "line-width": 1.5, "line-dasharray": [2, 1] },
      });
      map.addSource("city-limits", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "city-limits",
        type: "line",
        source: "city-limits",
        layout: { visibility: "none" },
        paint: { "line-color": "#8856a7", "line-width": 1.5 },
      });
      map.addSource("national-forest", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "national-forest-fill",
        type: "fill",
        source: "national-forest",
        layout: { visibility: "none" },
        paint: { "fill-color": "#1a9850", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "national-forest-line",
        type: "line",
        source: "national-forest",
        layout: { visibility: "none" },
        paint: { "line-color": "#1a9850", "line-width": 1 },
      });
      map.addSource("school-districts", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "school-districts",
        type: "line",
        source: "school-districts",
        layout: { visibility: "none" },
        paint: { "line-color": "#eb6834", "line-width": 1.5, "line-dasharray": [1, 1] },
      });
      map.addSource("zip-codes", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "zip-codes",
        type: "line",
        source: "zip-codes",
        layout: { visibility: "none" },
        paint: { "line-color": "#1baf7a", "line-width": 1, "line-dasharray": [4, 2] },
      });
      map.addSource("libraries", { type: "geojson", data: emptyFC });
      map.addLayer({
        id: "libraries",
        type: "circle",
        source: "libraries",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 5,
          "circle-color": "#4a3aa7",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.on("click", "libraries", (e: MapLayerMouseEvent) => {
        const name = e.features?.[0]?.properties?.name;
        const geometry = e.features?.[0]?.geometry;
        if (name && geometry?.type === "Point") {
          new Popup().setLngLat(geometry.coordinates as [number, number]).setText(name).addTo(map);
        }
      });

      let points: MapPoint[];
      try {
        const res = await fetch("/api/points");
        if (!res.ok) throw new Error(`/api/points returned ${res.status}`);
        points = (await res.json()) as MapPoint[];
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load points");
        return;
      }

      const withCoords = points.filter((p) => p.latitude !== null && p.longitude !== null);
      setPointCount(withCoords.length);
      setMissingCoordCount(points.length - withCoords.length);
      setAllPoints(points);

      map.addSource("registrants", {
        type: "geojson",
        data: toFeatureCollection(points),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "registrants",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#4575b4",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            20,
            22,
            50,
            28,
            100,
            34,
          ],
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "registrants",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "registrants",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 7,
          "circle-color": [
            "match",
            ["get", "geocodeAccuracyType"],
            "rooftop",
            ACCURACY_COLORS.rooftop!,
            "range_interpolation",
            ACCURACY_COLORS.range_interpolation!,
            "street_center",
            ACCURACY_COLORS.street_center!,
            "place",
            ACCURACY_COLORS.place!,
            ACCURACY_COLORS.unknown!,
          ],
          "circle-stroke-width": ["case", ["get", "geocodeStale"], 3, 1],
          "circle-stroke-color": ["case", ["get", "geocodeStale"], "#d73027", "#ffffff"],
        },
      });

      const bounds = new LngLatBounds();
      for (const p of withCoords) bounds.extend([p.longitude!, p.latitude!]);
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13 });

      map.on("click", "clusters", (e: MapLayerMouseEvent) => {
        if (drawModeRef.current) return;
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource("registrants") as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = features[0]?.geometry;
          if (geometry?.type !== "Point") return;
          map.easeTo({ center: geometry.coordinates as [number, number], zoom });
        });
      });

      map.on("click", "unclustered-point", (e: MapLayerMouseEvent) => {
        if (drawModeRef.current) return;
        const props = e.features?.[0]?.properties ?? null;
        setSelected(props);
      });

      // Polygon-draw overlay: an empty source now, filled in by the
      // draw-mode effect below as vertices are added.
      map.addSource("draw-area", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "draw-area-fill",
        type: "fill",
        source: "draw-area",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#2a78d6", "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: "draw-area-line",
        type: "line",
        source: "draw-area",
        paint: { "line-color": "#2a78d6", "line-width": 2 },
      });
      map.addLayer({
        id: "draw-area-vertices",
        type: "circle",
        source: "draw-area",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 4, "circle-color": "#2a78d6" },
      });

      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

      setLayersReady(true);
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Click-to-add-vertex, active only while drawMode is on.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawMode) return;
    const handler = (e: MapMouseEvent) => {
      setDrawVertices((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [drawMode]);

  // Push the filtered point set into the map whenever a dashboard checkbox
  // changes — points outside the active filters simply don't render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const source = map.getSource("registrants") as GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(filteredPoints));
  }, [filteredPoints, layersReady]);

  // Redraw the in-progress polygon whenever a vertex is added.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const source = map.getSource("draw-area") as GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = drawVertices.map(([lng, lat]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {},
    }));
    if (drawVertices.length >= 2) {
      const ring =
        drawVertices.length >= 3 ? [...drawVertices, drawVertices[0]!] : drawVertices;
      features.push({ type: "Feature", geometry: { type: "LineString", coordinates: ring }, properties: {} });
    }
    if (drawVertices.length >= 3) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[...drawVertices, drawVertices[0]!]] },
        properties: {},
      });
    }
    source.setData({ type: "FeatureCollection", features });
  }, [drawVertices, layersReady]);

  function startDraw() {
    setSelectedRows(null);
    setDrawVertices([]);
    setDrawMode(true);
  }
  function cancelDraw() {
    setDrawMode(false);
    setDrawVertices([]);
  }
  function finishDraw() {
    if (drawVertices.length < 3) return;
    const ring: [number, number][] = [...drawVertices, drawVertices[0]!];
    const matched = filteredPoints.filter(
      (p) =>
        p.latitude !== null &&
        p.longitude !== null &&
        pointInGeometry(p.longitude, p.latitude, { type: "Polygon", coordinates: [ring] })
    );
    setSelectedRows(matched);
    setDrawMode(false);
  }
  function clearSelection() {
    setSelectedRows(null);
    setDrawVertices([]);
    const source = mapRef.current?.getSource("draw-area") as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
  }

  async function toggleOverlay(key: OverlayKey) {
    const map = mapRef.current;
    if (!map || !layersReady) return;
    const next = !overlays[key];
    setOverlays((prev) => ({ ...prev, [key]: next }));

    if (key === "roads") {
      for (const layer of map.getStyle().layers ?? []) {
        if ("source-layer" in layer && ROAD_SOURCE_LAYERS.has(layer["source-layer"] ?? "")) {
          map.setLayoutProperty(layer.id, "visibility", next ? "visible" : "none");
        }
      }
      return;
    }

    // First time this boundary layer is turned on, fetch its data — not
    // before. Nobody pays for county/city/school-district/zip/library data
    // unless they actually ask to see it.
    const sourceUrl = BOUNDARY_SOURCE_URLS[key];
    const sourceId = BOUNDARY_SOURCE_IDS[key];
    if (next && sourceUrl && sourceId && !loadedBoundariesRef.current.has(key)) {
      loadedBoundariesRef.current.add(key);
      try {
        const geojson = await fetch(sourceUrl).then((r) => r.json());
        (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(geojson);
      } catch {
        loadedBoundariesRef.current.delete(key); // allow retry on next toggle
      }
    }

    const layerIds: Record<Exclude<OverlayKey, "roads">, string[]> = {
      countyLimits: ["county-limits"],
      cityLimits: ["city-limits"],
      aerial: ["aerial"],
      topography: ["topography"],
      nationalForest: ["national-forest-fill", "national-forest-line"],
      schoolDistricts: ["school-districts"],
      zipCodes: ["zip-codes"],
      libraries: ["libraries"],
    };
    for (const id of layerIds[key]) {
      map.setLayoutProperty(id, "visibility", next ? "visible" : "none");
    }
  }

  return (
    <div className="relative h-screen w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 z-10 space-y-2">
        <div className="rounded bg-white/90 px-3 py-2 text-xs shadow">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : pointCount === null ? (
            <span>Loading registrants…</span>
          ) : (
            <div className="space-y-1">
              <div>
                {Object.keys(filters).length > 0
                  ? `${filteredPoints.filter((p) => p.latitude !== null).length} of ${pointCount} points shown (filtered)`
                  : `${pointCount} points shown`}
                {missingCoordCount ? ` · ${missingCoordCount} without coordinates (not mapped)` : ""}
              </div>
              <Legend />
            </div>
          )}
        </div>

        <div className="rounded bg-white/90 px-3 py-2 text-xs shadow">
          <div className="mb-1 font-semibold">Layers</div>
          {(Object.keys(OVERLAY_LABELS) as OverlayKey[]).map((key) => (
            <label key={key} className="flex items-center gap-1.5 py-0.5">
              <input
                type="checkbox"
                checked={overlays[key]}
                disabled={!layersReady}
                onChange={() => toggleOverlay(key)}
              />
              {OVERLAY_LABELS[key]}
            </label>
          ))}
        </div>

        <div className="rounded bg-white/90 px-3 py-2 text-xs shadow">
          {!drawMode ? (
            <div className="flex gap-2">
              <button
                className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40"
                disabled={!layersReady}
                onClick={startDraw}
              >
                Select area
              </button>
              <button
                className="rounded bg-gray-200 px-2 py-1 disabled:opacity-40"
                disabled={!layersReady}
                onClick={() => setShowDashboard((v) => !v)}
              >
                {showDashboard ? "Hide dashboard" : "Dashboard"}
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div>Click to place points ({drawVertices.length} so far). Need at least 3.</div>
              <div className="flex gap-2">
                <button
                  className="rounded bg-blue-600 px-2 py-1 text-white disabled:opacity-40"
                  disabled={drawVertices.length < 3}
                  onClick={finishDraw}
                >
                  Finish
                </button>
                <button className="rounded bg-gray-200 px-2 py-1" onClick={cancelDraw}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDashboard && (
        <Dashboard
          points={allPoints}
          filters={filters}
          onToggleFilter={toggleFilter}
          onClearFilters={clearFilters}
          filteredCount={filteredPoints.length}
          onClose={() => setShowDashboard(false)}
        />
      )}

      {selected && (
        <div className="absolute right-3 top-3 z-10 w-72 rounded bg-white p-4 text-sm shadow-lg">
          <button
            className="float-right text-gray-400 hover:text-gray-600"
            onClick={() => setSelected(null)}
            aria-label="Close"
          >
            ✕
          </button>
          <h2 className="mb-2 font-semibold">Registrant {String(selected.childId)}</h2>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
            <Field label="Age group" value={selected.ageGroup} />
            <Field label="Months registered" value={selected.monthsRegistered} />
            <Field label="Projected graduation" value={selected.projectedGraduation} />
            <Field label="Months to graduation" value={selected.monthsToGraduation} />
            <Field label="Program partner" value={selected.programPartner} />
            <Field label="Book language" value={selected.bookLanguage} />
            <Field label="Graduated" value={selected.graduated ? "Yes" : "No"} />
            <Field label="Welcome book" value={selected.welcomeBook ? "Yes" : "No"} />
            <Field label="City" value={selected.city} />
            <Field label="County" value={selected.county} />
            <Field label="ZIP" value={selected.zipcode} />
            <Field label="Geocode accuracy" value={selected.geocodeAccuracyType} />
          </dl>
          {selected.geocodeStale ? (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-red-700">
              Address changed after the last geocode run — location may be stale.
            </p>
          ) : null}
        </div>
      )}

      {selectedRows && (
        <div className="absolute bottom-3 left-3 z-10 max-h-80 w-[36rem] max-w-[calc(100vw-1.5rem)] overflow-auto rounded bg-white p-4 text-xs shadow-lg">
          <button
            className="float-right text-gray-400 hover:text-gray-600"
            onClick={clearSelection}
            aria-label="Close selection"
          >
            ✕
          </button>
          <h2 className="mb-2 font-semibold">
            {selectedRows.length} registrant{selectedRows.length === 1 ? "" : "s"} in selected area
          </h2>
          {selectedRows.length === 0 ? (
            <p className="text-gray-500">No registrants fall inside that area.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-gray-500">
                  <SortHeader label="Child ID" column="childId" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="Age group" column="ageGroup" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="County" column="county" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="City" column="city" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="Language" column="bookLanguage" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="Graduated" column="graduated" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                  <SortHeader label="Accuracy" column="geocodeAccuracyType" sortColumn={sortColumn} sortAsc={sortAsc} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {(sortedSelectedRows ?? []).map((r) => (
                  <tr key={r.childId} className="border-b border-gray-100">
                    <td className="py-1 pr-2">{r.childId}</td>
                    <td className="py-1 pr-2">{r.ageGroup ?? "—"}</td>
                    <td className="py-1 pr-2">{r.county ?? "—"}</td>
                    <td className="py-1 pr-2">{r.city ?? "—"}</td>
                    <td className="py-1 pr-2">{r.bookLanguage ?? "—"}</td>
                    <td className="py-1 pr-2">{r.graduated ? "Yes" : "No"}</td>
                    <td className="py-1 pr-2">{r.geocodeAccuracyType ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortColumn,
  sortAsc,
  onSort,
}: {
  label: string;
  column: keyof MapPoint;
  sortColumn: keyof MapPoint;
  sortAsc: boolean;
  onSort: (column: keyof MapPoint) => void;
}) {
  const active = column === sortColumn;
  return (
    <th
      className="cursor-pointer select-none py-1 pr-2 hover:text-gray-700"
      onClick={() => onSort(column)}
    >
      {label} {active ? (sortAsc ? "▲" : "▼") : ""}
    </th>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd>{value === null || value === undefined || value === "" ? "—" : String(value)}</dd>
    </>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {Object.entries(ACCURACY_COLORS).map(([type, color]) => (
        <span key={type} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {type}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-red-600 bg-white" />
        stale
      </span>
    </div>
  );
}
