"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import MapGL, {
  Layer,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { Bbox, Coord, Place, Resort, Route } from "@/lib/api";
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
  lodging: Place[];
  /** When this changes, the map flies to it (e.g. a search result). */
  flyTo: Coord | null;
  onLoad?: () => void;
  onViewChange?: (view: { bbox: Bbox; zoom: number }) => void;
  onPickOrigin: (coord: Coord) => void;
  onSelectResort: (id: string) => void;
};

const LODGING_LAYER = "lodging-pins";

export default function MapView({
  resorts,
  selectedResortId,
  origin,
  route,
  lodging,
  flyTo,
  onLoad,
  onViewChange,
  onPickOrigin,
  onSelectResort,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (flyTo) {
      mapRef.current?.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 14 });
    }
  }, [flyTo]);

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

  function reportView(map: MapLibreMap) {
    const b = map.getBounds();
    onViewChange?.({
      bbox: {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      },
      zoom: map.getZoom(),
    });
  }

  return (
    <MapGL
      ref={mapRef}
      initialViewState={HAKUBA_VIEW}
      mapStyle={MAP_STYLE_URL}
      style={{ position: "absolute", inset: 0 }}
      attributionControl={{
        customAttribution:
          'Snow: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>',
      }}
      interactiveLayerIds={[LODGING_LAYER]}
      onLoad={(e) => {
        reportView(e.target);
        onLoad?.();
      }}
      onMoveEnd={(e: ViewStateChangeEvent) => reportView(e.target)}
      onClick={(e) => {
        // a lodging pin snaps the origin onto the hotel itself
        const pin = e.features?.[0]?.geometry;
        if (pin?.type === "Point") {
          const [lng, lat] = pin.coordinates;
          onPickOrigin({ lat, lng });
        } else {
          onPickOrigin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        }
      }}
    >
      <NavigationControl position="bottom-right" />

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
