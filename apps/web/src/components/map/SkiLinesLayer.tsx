import type { ExpressionSpecification } from "maplibre-gl";
import { Layer, Source } from "react-map-gl/maplibre";
import { LODGING_LAYER } from "@/components/map/LodgingLayer";

// OpenSkiMap's Japan convention (SPEC-ski-runs "Map"): kept clear of the blue route
const GREEN = "hsl(125,100%,33%)";
const RED = "hsl(359,94%,53%)";
const ORANGE = "hsl(34,100%,50%)";
export const RUN_COLORS: Record<string, string> = {
  novice: GREEN,
  easy: GREEN,
  intermediate: RED,
  advanced: "#000000",
  expert: "#000000",
  // shortcut: drawn solid, not dashed; the 2026-11-23 snapshot has no freeride or extreme run, add a dashed layer when one appears
  freeride: ORANGE,
  extreme: ORANGE,
};
export const UNKNOWN_RUN_COLOR = "hsl(0,0%,35%)";
export const LIFT_COLOR = "hsl(0,82%,42%)";

/** The colour a run of this difficulty is drawn in; the layer below uses the same table. */
export const runColor = (difficulty: string | null) =>
  (difficulty && RUN_COLORS[difficulty]) || UNKNOWN_RUN_COLOR;

export const SKI_HIT_LAYER = "ski-lines-hit";
export const SKI_LAYERS = [
  "ski-selected",
  "ski-runs",
  "ski-lifts-casing",
  "ski-lifts",
  "ski-names",
  SKI_HIT_LAYER,
];

/** One run or lift, as `/api/ski-lines` serves it (SPEC-ski-runs "Data"). */
export type SkiLine = {
  id: string;
  kind: "run" | "lift";
  name: string | null;
  difficulty: string | null;
  liftType: string | null;
  resortId: string;
  /** measured at refresh (SPEC-ski-runs v1.2): along the slope, m */
  distanceM: number | null;
  minElevationM: number | null;
  maxElevationM: number | null;
  /** average: vertical / ground length × 100 */
  slopePct: number | null;
  /** lifts only: ride time, s */
  durationS: number | null;
};

/** A tapped feature's properties (untyped, from MapLibre) as a SkiLine, or null. */
export function skiLineOf(p: Record<string, unknown> | null | undefined) {
  if (!p || (p.kind !== "run" && p.kind !== "lift")) return null;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    id: String(p.id),
    kind: p.kind,
    name: text(p.name),
    difficulty: text(p.difficulty),
    liftType: text(p.liftType),
    resortId: String(p.resortId),
    distanceM: num(p.distanceM),
    minElevationM: num(p.minElevationM),
    maxElevationM: num(p.maxElevationM),
    slopePct: num(p.slopePct),
    durationS: num(p.durationS),
  } satisfies SkiLine;
}

const RUN_COLOR_BY_DIFFICULTY = [
  "match",
  ["get", "difficulty"],
  ...Object.entries(RUN_COLORS).flat(),
  UNKNOWN_RUN_COLOR,
] as unknown as ExpressionSpecification; // spread entries: TS can't see the label/value pairs

// the valley overview (zoom 11) shows every resort's lines (v1.3)
const MINZOOM = 10;

const width = (at10: number, at16: number): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  MINZOOM,
  at10,
  16,
  at16,
];

/**
 * Runs and lifts from the snapshot, under every route and pin: each layer sits below the
 * lodging pins, whatever order MapLibre adds them in. A tap on one opens its card
 * (SPEC-ski-runs v1.1); `selectedId` outlines that line.
 */
export function SkiLinesLayer({
  selectedId = null,
}: {
  selectedId?: string | null;
}) {
  return (
    // MapLibre fetches and parses the URL in its worker; cached an hour by the API
    <Source id="ski-lines" type="geojson" data="/api/ski-lines">
      <Layer
        id="ski-selected"
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        filter={["==", ["get", "id"], selectedId ?? ""]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": "hsl(48,100%,55%)",
          "line-opacity": 0.8,
          "line-width": width(8, 14),
        }}
      />
      <Layer
        id="ski-runs"
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        filter={["==", ["get", "kind"], "run"]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": RUN_COLOR_BY_DIFFICULTY,
          "line-width": width(1.5, 4),
        }}
      />
      <Layer
        id="ski-lifts-casing"
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        filter={["==", ["get", "kind"], "lift"]}
        paint={{
          "line-color": "#ffffff",
          "line-width": width(2.5, 5),
        }}
      />
      <Layer
        id="ski-lifts"
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        filter={["==", ["get", "kind"], "lift"]}
        paint={{
          "line-color": LIFT_COLOR,
          "line-width": width(1, 2.5),
        }}
      />
      <Layer
        id="ski-names"
        type="symbol"
        beforeId={LODGING_LAYER}
        minzoom={14}
        layout={{
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          // a font the OpenFreeMap style serves; MapLibre's default (Open Sans) 404s
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
        }}
        paint={{
          "text-color": "#1f2937",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        }}
      />
      {/* invisible, finger-sized tap target: a run is 1.5–4 px wide */}
      <Layer
        id={SKI_HIT_LAYER}
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        paint={{
          "line-color": "#000000",
          "line-opacity": 0,
          "line-width": 16,
        }}
      />
    </Source>
  );
}
