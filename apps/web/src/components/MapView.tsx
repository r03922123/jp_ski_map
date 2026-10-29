"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { setWorkerUrl } from "maplibre-gl";
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Source,
} from "react-map-gl/maplibre";
import type { Coord, Resort, Route } from "@/lib/api";
import {
  HAKUBA_VIEW,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";

setWorkerUrl(MAPLIBRE_WORKER_URL);

export type MapViewProps = {
  resorts: Resort[];
  selectedResortId: string | null;
  origin: Coord | null;
  route: Route | null;
  onLoad?: () => void;
  onPickOrigin: (coord: Coord) => void;
  onSelectResort: (id: string) => void;
};

export default function MapView({
  resorts,
  selectedResortId,
  origin,
  route,
  onLoad,
  onPickOrigin,
  onSelectResort,
}: MapViewProps) {
  return (
    <MapGL
      initialViewState={HAKUBA_VIEW}
      mapStyle={MAP_STYLE_URL}
      style={{ position: "absolute", inset: 0 }}
      onLoad={onLoad}
      onClick={(e) => onPickOrigin({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
    >
      <NavigationControl position="bottom-right" />

      {route && (
        <Source id="route" type="geojson" data={route.geometry}>
          <Layer
            id="route-casing"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": "#ffffff", "line-width": 9 }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": route.mode === "walk" ? "#0f766e" : "#2563eb",
              "line-width": 5,
              "line-dasharray": route.mode === "walk" ? [1, 1.5] : [1, 0],
            }}
          />
        </Source>
      )}

      {resorts.map((r) => {
        const point = r.accessPoints[0];
        const selected = r.id === selectedResortId;
        return (
          <Marker
            key={r.id}
            latitude={point.coord.lat}
            longitude={point.coord.lng}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectResort(r.id);
            }}
          >
            <button
              type="button"
              aria-label={r.name.en}
              aria-pressed={selected}
              className={`rounded-full border-2 border-white px-2 py-0.5 text-xs font-semibold shadow ${
                selected ? "bg-blue-600 text-white" : "bg-white text-slate-800"
              }`}
            >
              ⛷{" "}
              {r.name.en.replace(
                / (Snow Resort|Snow Field|Mountain Resort|Ski Resort.*)$/,
                "",
              )}
            </button>
          </Marker>
        );
      })}

      {origin && (
        <Marker latitude={origin.lat} longitude={origin.lng} anchor="bottom">
          <span
            role="img"
            aria-label="Starting point"
            className="text-3xl drop-shadow"
          >
            📍
          </span>
        </Marker>
      )}
    </MapGL>
  );
}
