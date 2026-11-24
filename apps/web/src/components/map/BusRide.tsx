import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { PixelSprite } from "@/components/PixelSprite";
import type { Coord, Route } from "@/lib/api";
import { ICONS } from "@/lib/game/sprites";
import { type RideStopMark, rideStopFeatures } from "@/lib/ride-stops";
import { type LngLat, labelAnchor } from "@/lib/route-geo";
import { EMPTY } from "./TrailLayers";

const RIDE_COLOR = "#0f766e"; // the line badge colour in the bus panel
const RIDE_CASING = "#134e4a";

/** The bus ride's road path, drawn under the walk trail. */
export function RideLine({ route }: { route: Route | null }) {
  return (
    <Source id="ride" type="geojson" data={route ? route.geometry : EMPTY}>
      <Layer
        id="ride-casing"
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": RIDE_CASING, "line-width": 9 }}
      />
      <Layer
        id="ride-line"
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": RIDE_COLOR, "line-width": 6 }}
      />
    </Source>
  );
}

/** The ride's stops as dots and names, on top of every route layer. */
export function RideStops({ stops }: { stops: RideStopMark[] | undefined }) {
  const rideStopsGeoJson = useMemo(
    () => rideStopFeatures(stops ?? []),
    [stops],
  );
  return (
    <Source id="ride-stops" type="geojson" data={rideStopsGeoJson}>
      {/* Google-Maps transit style: on and off stand out, stops between are small */}
      <Layer
        id="ride-stop-dots"
        type="circle"
        paint={{
          "circle-radius": ["match", ["get", "role"], "via", 5, 8],
          "circle-color": "#ffffff",
          "circle-stroke-color": RIDE_CASING,
          "circle-stroke-width": ["match", ["get", "role"], "via", 2.5, 3.5],
        }}
      />
      <Layer
        id="ride-stop-names"
        type="symbol"
        layout={{
          // where you get on and off: always; the stops between: once zoomed in
          // (MapLibre allows "zoom" only as the input of a top-level step)
          "text-field": [
            "step",
            ["zoom"],
            ["case", ["==", ["get", "role"], "via"], "", ["get", "name"]],
            14,
            ["get", "name"],
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["match", ["get", "role"], "via", 11, 12.5],
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-max-width": 9,
        }}
        paint={{
          "text-color": RIDE_CASING,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        }}
      />
    </Source>
  );
}

/** Boarding stop of the chosen bus option. */
export function BoardingStop({ at }: { at: Coord | null }) {
  return (
    at && (
      <Marker latitude={at.lat} longitude={at.lng} anchor="bottom">
        <PixelSprite id="stop" sprite={ICONS.stop} alt="Bus stop" />
      </Marker>
    )
  );
}

/** The ride's chip (line and ride time) halfway along it; hidden while navigating. */
export function RideLabel({
  ride,
  piloting,
}: {
  ride: { route: Route; label: string | null } | null;
  piloting: boolean;
}) {
  const rideLabelAt =
    ride && ride.route.geometry.coordinates.length > 1
      ? labelAnchor(ride.route.geometry.coordinates as LngLat[], [])
      : null;
  return (
    ride &&
    rideLabelAt &&
    !piloting && (
      <Marker
        longitude={rideLabelAt[0]}
        latitude={rideLabelAt[1]}
        anchor="bottom"
        style={{ zIndex: 3, pointerEvents: "none" }}
      >
        <span
          data-route-label="ride"
          className="mb-1 whitespace-nowrap rounded-lg bg-teal-700 px-2 py-1 text-xs font-semibold text-white shadow-md ring-1 ring-teal-900"
        >
          🚌 {ride.label ?? "bus"}
        </span>
      </Marker>
    )
  );
}
