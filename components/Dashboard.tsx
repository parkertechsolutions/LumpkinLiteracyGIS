import type { MapPoint } from "@/lib/data/points";

// Palette per the dataviz skill's validated reference (references/palette.md):
// a single sequential-blue accent for plain magnitude bars, the status
// "warning" step for the one genuine data-quality callout (stale records),
// and the same accuracy-type colors MapView's legend already uses — same
// entity, same color, in both places.
const ACCENT = "#2a78d6";
const WARNING = "#fab219";
const INK_PRIMARY = "#0b0b0b";
const INK_SECONDARY = "#52514e";
const INK_MUTED = "#898781";
const GRIDLINE = "#e1e0d9";

const ACCURACY_COLORS: Record<string, string> = {
  rooftop: "#1a9850",
  range_interpolation: "#91cf60",
  street_center: "#fee08b",
  place: "#fc8d59",
  unknown: "#999999",
};

export type FilterDimension =
  | "county"
  | "ageGroup"
  | "bookLanguage"
  | "registrationType"
  | "lppGroup"
  | "geocodeAccuracyType"
  | "graduated"
  | "welcomeBook";

export const DIMENSION_LABELS: Record<FilterDimension, string> = {
  county: "County",
  ageGroup: "Age group",
  bookLanguage: "Book language",
  registrationType: "Registration type",
  lppGroup: "LPP group",
  geocodeAccuracyType: "Geocode accuracy",
  graduated: "Graduated",
  welcomeBook: "Welcome book",
};

// Single source of truth for "what string represents this point on this
// dimension" — used both to build the bars below and, in MapView, to decide
// which points a filter selection actually matches. Keeping them in one
// place means a bar's label and the filter it sets can never drift apart.
export const DIMENSION_ACCESSORS: Record<FilterDimension, (p: MapPoint) => string> = {
  county: (p) => p.county ?? "(none)",
  ageGroup: (p) => p.ageGroup ?? "(none)",
  bookLanguage: (p) => p.bookLanguage ?? "(none)",
  registrationType: (p) => p.registrationType ?? "(none)",
  lppGroup: (p) => p.lppGroup ?? "(none)",
  geocodeAccuracyType: (p) => p.geocodeAccuracyType ?? "(none)",
  graduated: (p) => (p.graduated ? "Yes" : "No"),
  welcomeBook: (p) => (p.welcomeBook ? "Yes" : "No"),
};

export type FilterState = Partial<Record<FilterDimension, Set<string>>>;

export function pointMatchesFilters(p: MapPoint, filters: FilterState): boolean {
  for (const dim of Object.keys(filters) as FilterDimension[]) {
    const values = filters[dim];
    if (!values || values.size === 0) continue;
    if (!values.has(DIMENSION_ACCESSORS[dim](p))) return false;
  }
  return true;
}

function countBy(points: MapPoint[], dimension: FilterDimension): [string, number][] {
  const fn = DIMENSION_ACCESSORS[dimension];
  const counts = new Map<string, number>();
  for (const p of points) counts.set(fn(p), (counts.get(fn(p)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border px-3 py-2" style={{ borderColor: GRIDLINE }}>
      <div className="text-lg font-semibold" style={{ color: color ?? INK_PRIMARY }}>
        {value}
      </div>
      <div className="text-xs" style={{ color: INK_SECONDARY }}>
        {label}
      </div>
    </div>
  );
}

function BarBreakdown({
  title,
  dimension,
  data,
  active,
  onToggle,
  colorFor,
}: {
  title: string;
  dimension: FilterDimension;
  data: [string, number][];
  active: Set<string>;
  onToggle: (dimension: FilterDimension, value: string) => void;
  colorFor?: (label: string) => string;
}) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <div>
      <div className="mb-1 text-xs font-semibold" style={{ color: INK_SECONDARY }}>
        {title}
      </div>
      <div className="space-y-1">
        {data.map(([label, count]) => {
          const isActive = active.has(label);
          return (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-2 rounded text-xs hover:bg-gray-50"
              style={isActive ? { outline: `1px solid ${ACCENT}` } : undefined}
            >
              <input
                type="checkbox"
                className="ml-0.5 shrink-0"
                checked={isActive}
                onChange={() => onToggle(dimension, label)}
              />
              <div
                className="w-24 shrink-0 truncate"
                style={{ color: isActive ? ACCENT : INK_PRIMARY, fontWeight: isActive ? 600 : 400 }}
                title={label}
              >
                {label}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded-sm" style={{ backgroundColor: GRIDLINE }}>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(count / max) * 100}%`,
                    backgroundColor: colorFor ? colorFor(label) : ACCENT,
                    opacity: isActive ? 1 : 0.85,
                  }}
                />
              </div>
              <div className="w-8 shrink-0 text-right tabular-nums" style={{ color: INK_MUTED }}>
                {count}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard({
  points,
  filters,
  onToggleFilter,
  onClearFilters,
  filteredCount,
  onClose,
}: {
  points: MapPoint[];
  filters: FilterState;
  onToggleFilter: (dimension: FilterDimension, value: string) => void;
  onClearFilters: () => void;
  filteredCount: number;
  onClose: () => void;
}) {
  const total = points.length;
  const mapped = points.filter((p) => p.latitude !== null).length;
  const stale = points.filter((p) => p.geocodeStale).length;
  const counties = new Set(points.map((p) => p.county).filter(Boolean)).size;
  const activeChips = (Object.keys(filters) as FilterDimension[]).flatMap((dim) =>
    [...(filters[dim] ?? [])].map((value) => ({ dim, value }))
  );

  return (
    <div className="absolute right-3 top-3 z-10 max-h-[calc(100vh-1.5rem)] w-80 overflow-y-auto rounded bg-white p-4 text-sm shadow-lg">
      <button
        className="float-right text-gray-400 hover:text-gray-600"
        onClick={onClose}
        aria-label="Close dashboard"
      >
        ✕
      </button>
      <h2 className="mb-3 font-semibold" style={{ color: INK_PRIMARY }}>
        Dashboard
      </h2>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatTile
          label="Registrants"
          value={activeChips.length > 0 ? `${filteredCount} / ${total}` : String(total)}
        />
        <StatTile label="Counties represented" value={String(counties)} />
        <StatTile label="Mapped" value={`${Math.round((mapped / total) * 100)}%`} />
        <StatTile
          label="Flagged stale"
          value={String(stale)}
          color={stale > 0 ? WARNING : undefined}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: ACCENT }}>
              Filtering the map
            </span>
            <button className="text-xs underline" style={{ color: INK_SECONDARY }} onClick={onClearFilters}>
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {activeChips.map(({ dim, value }) => (
              <button
                key={`${dim}:${value}`}
                className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] shadow-sm"
                style={{ color: ACCENT, border: `1px solid ${ACCENT}` }}
                onClick={() => onToggleFilter(dim, value)}
                title={`Remove ${DIMENSION_LABELS[dim]}: ${value}`}
              >
                {DIMENSION_LABELS[dim]}: {value} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-[10px]" style={{ color: INK_MUTED }}>
        Check boxes below to show only matching registrants on the map — checks across
        different rows narrow further (e.g. Spanish + age 1 + age 2).
      </p>

      <div className="space-y-4">
        <BarBreakdown
          title={`County (${countBy(points, "county").length})`}
          dimension="county"
          data={countBy(points, "county")}
          active={filters.county ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="Age group"
          dimension="ageGroup"
          data={countBy(points, "ageGroup")}
          active={filters.ageGroup ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="Book language"
          dimension="bookLanguage"
          data={countBy(points, "bookLanguage")}
          active={filters.bookLanguage ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="Registration type"
          dimension="registrationType"
          data={countBy(points, "registrationType")}
          active={filters.registrationType ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="LPP group"
          dimension="lppGroup"
          data={countBy(points, "lppGroup")}
          active={filters.lppGroup ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="Geocode accuracy"
          dimension="geocodeAccuracyType"
          data={countBy(points, "geocodeAccuracyType")}
          active={filters.geocodeAccuracyType ?? new Set()}
          onToggle={onToggleFilter}
          colorFor={(label) => ACCURACY_COLORS[label] ?? "#999999"}
        />
        <BarBreakdown
          title="Graduated"
          dimension="graduated"
          data={countBy(points, "graduated")}
          active={filters.graduated ?? new Set()}
          onToggle={onToggleFilter}
        />
        <BarBreakdown
          title="Welcome book"
          dimension="welcomeBook"
          data={countBy(points, "welcomeBook")}
          active={filters.welcomeBook ?? new Set()}
          onToggle={onToggleFilter}
        />
      </div>
    </div>
  );
}
