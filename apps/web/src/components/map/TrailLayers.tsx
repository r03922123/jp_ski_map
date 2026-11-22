import { Layer, Source } from "react-map-gl/maplibre";
import type { Route } from "@/lib/api";
import { type LngLat, segment } from "@/lib/route-geo";

export const EMPTY = { type: "FeatureCollection" as const, features: [] };

// SPEC-game-theme: the chosen route is an overworld trail
const TRAIL_INK = "#22223a";
const TRAIL_GOLD = "#ffd25e";

/**
 * The chosen route as an overworld trail, then the part already covered while navigating
 * (grey), then the highlighted step. Always mounted, empty when unused (see MapView).
 */
export function TrailLayers({
  active,
  covered,
  highlight,
}: {
  active: Route | null;
  /** navigating: the route behind the rider */
  covered: LngLat[] | null;
  /** shape range of the step to highlight on the active route */
  highlight: [number, number] | null;
}) {
  const activeCoords = (active?.geometry.coordinates ?? []) as LngLat[];
  const highlightCoords =
    highlight && activeCoords.length ? segment(activeCoords, highlight) : [];
  const isWalk = active?.mode === "walk";
  return (
    <>
      <Source
        id="route-active"
        type="geojson"
        data={active ? active.geometry : EMPTY}
      >
        <Layer
          id="route-active-casing"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          // the overworld path: an ink track (gold dashes on top by car)
          paint={{
            "line-color": isWalk ? "#ffffff" : TRAIL_INK,
            "line-width": isWalk ? 0 : 9,
          }}
        />
        <Layer
          id="route-active-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": isWalk ? TRAIL_INK : TRAIL_GOLD,
            "line-width": isWalk ? 7 : 4,
            // zero-length dashes with round caps draw as dots
            // an overworld trail: footprint dots on foot, a dashed track by car
            // (round caps add a line width to every dash, so the gap must be wider than 1)
            "line-dasharray": isWalk ? [0, 1.6] : [1.5, 2],
          }}
        />
      </Source>
      <Source
        id="route-covered"
        type="geojson"
        data={
          covered && covered.length > 1
            ? {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: covered },
              }
            : EMPTY
        }
      >
        <Layer
          id="route-covered-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#9ca3af", "line-width": 7 }}
        />
      </Source>
      <Source
        id="route-highlight"
        type="geojson"
        data={{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: highlightCoords },
        }}
      >
        <Layer
          id="route-highlight-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#f59e0b", "line-width": 8 }}
        />
      </Source>
    </>
  );
}
