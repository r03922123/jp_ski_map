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

/** The wide invisible line a tap on a run or lift hits (MapView's `interactiveLayerIds`). */
export const SKI_HIT_LAYER = "ski-hit";
// the tapped line, under its run or lift, as OpenSkiMap marks a selection
const SELECTED_COLOR = "hsl(55,100%,50%)";
const MINZOOM = 10; // the valley overview (zoom 11) shows every resort's lines

export const SKI_LAYERS = [
  "ski-selected",
  "ski-runs",
  "ski-lifts-casing",
  "ski-lifts",
  "ski-names",
  SKI_HIT_LAYER,
];

const RUN_COLOR_BY_DIFFICULTY = [
  "match",
  ["get", "difficulty"],
  ...Object.entries(RUN_COLORS).flat(),
  UNKNOWN_RUN_COLOR,
] as unknown as ExpressionSpecification; // spread entries: TS can't see the label/value pairs

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
 * lodging pins, whatever order MapLibre adds them in. A tap opens the line's card (SPEC-ski-runs v2).
 */
export function SkiLinesLayer({ selectedId }: { selectedId: string | null }) {
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
          "line-color": SELECTED_COLOR,
          "line-width": width(6, 12),
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
      <Layer
        id={SKI_HIT_LAYER}
        type="line"
        beforeId={LODGING_LAYER}
        minzoom={MINZOOM}
        paint={{ "line-color": "#000000", "line-opacity": 0, "line-width": 16 }}
      />
    </Source>
  );
}
