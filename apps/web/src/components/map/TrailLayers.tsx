import { Layer, Source } from "react-map-gl/maplibre";
import type { Route } from "@/lib/api";
import { TOKENS } from "@/lib/game/tokens";
import { type LngLat, segment } from "@/lib/route-geo";

export const EMPTY = { type: "FeatureCollection" as const, features: [] };

// SPEC-web-app v1.30: the chosen route is the app's primary blue over a darker casing
const ROUTE_BLUE = TOKENS.primary;
const ROUTE_CASING = "#0e3f8c";

/**
 * The chosen route as a blue line, then the part already covered while navigating
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
          // no casing on foot: it would fill the dots in
          paint={{
            "line-color": ROUTE_CASING,
            "line-width": isWalk ? 0 : 9,
          }}
        />
        <Layer
          id="route-active-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": ROUTE_BLUE,
            "line-width": isWalk ? 7 : 6,
            // on foot, zero-length dashes with round caps draw as dots (round caps add a
            // line width to every dash, so the gap must be wider than 1)
            ...(isWalk ? { "line-dasharray": [0, 1.6] } : {}),
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
