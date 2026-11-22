import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { Place } from "@/lib/api";

/** Interactive: a click or press on a hotel pin is about that hotel. */
export const LODGING_LAYER = "lodging-pins";

/** Lodging nearby as purple pins, named once zoomed in. */
export function LodgingLayer({ lodging }: { lodging: Place[] }) {
  const lodgingGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: lodging.map((p) => ({
        type: "Feature" as const,
        properties: { name: p.name },
        geometry: {
          type: "Point" as const,
          coordinates: [p.coord.lng, p.coord.lat],
        },
      })),
    }),
    [lodging],
  );
  return (
    <Source id="lodging" type="geojson" data={lodgingGeoJson}>
      <Layer
        id={LODGING_LAYER}
        type="circle"
        paint={{
          "circle-radius": 6,
          "circle-color": "#9333ea",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        }}
      />
      <Layer
        id="lodging-labels"
        type="symbol"
        minzoom={15}
        layout={{
          "text-field": ["get", "name"],
          // a font the OpenFreeMap style serves; MapLibre's default (Open Sans) 404s
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
        }}
        paint={{
          "text-color": "#581c87",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        }}
      />
    </Source>
  );
}
