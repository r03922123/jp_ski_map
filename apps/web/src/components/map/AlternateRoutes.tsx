import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { Route } from "@/lib/api";

/** Interactive: a tap on an alternate selects it (its feature carries `index`). */
export const ALT_HIT_LAYER = "route-alts-hit";
const ALT_CASING = "#6b7a90";

/** Every route but the active one, dashed grey, with a finger-sized tap target. */
export function AlternateRoutes({
  routes,
  activeRoute,
}: {
  routes: Route[];
  activeRoute: number;
}) {
  const altGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: routes
        .map((route, index) => ({ route, index }))
        .filter(({ index }) => index !== activeRoute)
        .map(({ route, index }) => ({
          type: "Feature" as const,
          properties: { index },
          geometry: route.geometry,
        })),
    }),
    [routes, activeRoute],
  );
  return (
    <Source id="route-alts" type="geojson" data={altGeoJson}>
      <Layer
        id="route-alts-casing"
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        // no casing under the alternates: it would fill their dashes in
        paint={{ "line-color": ALT_CASING, "line-width": 0 }}
      />
      <Layer
        id="route-alts-line"
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{
          "line-color": ALT_CASING,
          "line-width": 5,
          "line-dasharray": [1.2, 1.6],
        }}
      />
      {/* invisible, finger-sized tap target */}
      <Layer
        id={ALT_HIT_LAYER}
        type="line"
        paint={{
          "line-color": "#000000",
          "line-opacity": 0,
          "line-width": 22,
        }}
      />
    </Source>
  );
}
