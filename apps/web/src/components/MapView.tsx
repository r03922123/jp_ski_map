"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { Bbox, Coord, Place, Resort, Route } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import {
  HAKUBA_VIEW,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";
import {
  type LngLat,
  labelAnchor,
  mapPadding,
  routeBounds,
  segment,
} from "@/lib/route-geo";
import type { SavedMarker } from "@/lib/saved-places";

setWorkerUrl(MAPLIBRE_WORKER_URL);

export type MapViewProps = {
  resorts: Resort[];
  selectedResortId: string | null;
  origin: Coord | null;
  destination: Coord | null;
  /** Primary first, then alternates. A new array (new search) refits the map. */
  routes: Route[];
  activeRoute: number;
  onSelectRoute?: (index: number) => void;
  /** Shape range of the step to highlight on the active route. */
  highlight?: [number, number] | null;
  lodging: Place[];
  /** Boarding stop of the chosen bus option. */
  busStop: Coord | null;
  /** The bus ride of the chosen option: its road path, its stops, and the ride time. */
  ride: { route: Route; stops: Coord[]; label: string | null } | null;
  /** When this changes, the map flies to it (e.g. a search result). */
  flyTo: Coord | null;
  onLoad?: () => void;
  onViewChange?: (view: { bbox: Bbox; zoom: number }) => void;
  onPickOrigin: (coord: Coord) => void;
  onSelectResort: (id: string) => void;
  /** Saved places (SPEC-saved-places); tapping one calls `onSelectSaved`. */
  saved?: SavedMarker[];
  onSelectSaved?: (id: string) => void;
};

const SAVED_ICONS: Record<SavedMarker["icon"], string> = {
  hotel: "🏨",
  star: "⭐",
  heart: "❤️",
  flag: "🚩",
  bookmark: "🔖",
};

const LODGING_LAYER = "lodging-pins";
const ALT_HIT_LAYER = "route-alts-hit";

const ROUTE_COLOR = "#2563eb";
const ROUTE_CASING = "#1e3a8a";
const ALT_COLOR = "#a3b1c6";
const RIDE_COLOR = "#0f766e"; // the line badge colour in the bus panel
const RIDE_CASING = "#134e4a";
const ALT_CASING = "#6b7a90";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MapView({
  resorts,
  selectedResortId,
  origin,
  destination,
  routes,
  activeRoute,
  onSelectRoute,
  highlight = null,
  lodging,
  busStop,
  ride = null,
  flyTo,
  onLoad,
  onViewChange,
  onPickOrigin,
  onSelectResort,
  saved = [],
  onSelectSaved,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  // routes can arrive before the map instance exists (shared URL); fit once it has
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (flyTo) {
      mapRef.current?.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: 14 });
    }
  }, [flyTo]);

  // Fit the whole route set once per new search, clear of the directions panel.
  // Keyed on what is drawn, not on prop identity: a parent re-render (e.g. after this
  // map reports a pan) must never re-fit, or the user can't pan at all.
  const drawn = [...routes, ...(ride ? [ride.route] : [])];
  const fitKey = drawn
    .map(
      (r) =>
        `${r.mode}:${r.durationS}:${r.distanceM}:${r.geometry.coordinates.length}`,
    )
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey stands for `drawn`
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || drawn.length === 0) return;
    const all = drawn.flatMap((r) => r.geometry.coordinates as LngLat[]);
    if (all.length < 2) return;
    const canvas = map.getCanvas();
    map.fitBounds(routeBounds(all), {
      padding: mapPadding({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      }),
      maxZoom: 16,
      duration: prefersReducedMotion() ? 0 : 700,
    });
  }, [fitKey, mapReady]);

  const active = routes[activeRoute] ?? null;
  const activeCoords = (active?.geometry.coordinates ?? []) as LngLat[];
  const alternates = useMemo(
    () =>
      routes
        .map((route, index) => ({ route, index }))
        .filter(({ index }) => index !== activeRoute),
    [routes, activeRoute],
  );
  const altGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: alternates.map(({ route, index }) => ({
        type: "Feature" as const,
        properties: { index },
        geometry: route.geometry,
      })),
    }),
    [alternates],
  );
  const labels = useMemo(
    () =>
      routes.map((route, index) => {
        const coords = route.geometry.coordinates as LngLat[];
        const others =
          index === activeRoute
            ? [] // the active route's label sits halfway along it
            : routes
                .filter((_, j) => j !== index)
                .map((r) => r.geometry.coordinates as LngLat[]);
        return {
          index,
          at: coords.length ? labelAnchor(coords, others) : null,
          text: formatDuration(route.durationS),
        };
      }),
    [routes, activeRoute],
  );
  const rideStopsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (ride?.stops ?? []).map((c) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
      })),
    }),
    [ride],
  );
  const rideLabelAt =
    ride && ride.route.geometry.coordinates.length > 1
      ? labelAnchor(ride.route.geometry.coordinates as LngLat[], [])
      : null;
  const highlightCoords =
    highlight && activeCoords.length ? segment(activeCoords, highlight) : [];
  const isWalk = active?.mode === "walk";

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
          'Snow: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> | Shuttle: <a href="https://www.hakubavalley.com/en/access_en/shuttlebus_en/" target="_blank" rel="noopener">Hakuba Valley</a>',
      }}
      interactiveLayerIds={[LODGING_LAYER, ALT_HIT_LAYER]}
      onLoad={(e) => {
        reportView(e.target);
        setMapReady(true);
        onLoad?.();
      }}
      onMoveEnd={(e: ViewStateChangeEvent) => reportView(e.target)}
      onClick={(e) => {
        const feature = e.features?.[0];
        if (feature?.layer.id === ALT_HIT_LAYER) {
          onSelectRoute?.(Number(feature.properties?.index));
          return;
        }
        // a lodging pin snaps the origin onto the hotel itself
        const pin = feature?.geometry;
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

      <Source id="route-alts" type="geojson" data={altGeoJson}>
        <Layer
          id="route-alts-casing"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ALT_CASING, "line-width": 8 }}
        />
        <Layer
          id="route-alts-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": ALT_COLOR, "line-width": 5 }}
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

      {active && (
        <Source id="route-active" type="geojson" data={active.geometry}>
          <Layer
            id="route-active-casing"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": isWalk ? "#ffffff" : ROUTE_CASING,
              "line-width": isWalk ? 0 : 9,
            }}
          />
          <Layer
            id="route-active-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": ROUTE_COLOR,
              "line-width": isWalk ? 7 : 6,
              // zero-length dashes with round caps draw as dots
              "line-dasharray": isWalk ? [0, 1.6] : [1, 0],
            }}
          />
        </Source>
      )}

      {ride && (
        <Source id="ride" type="geojson" data={ride.route.geometry}>
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
      )}
      <Source id="ride-stops" type="geojson" data={rideStopsGeoJson}>
        <Layer
          id="ride-stop-dots"
          type="circle"
          paint={{
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-color": RIDE_CASING,
            "circle-stroke-width": 2,
          }}
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

      {saved.map((p) => (
        <Marker
          key={`saved-${p.id}`}
          latitude={p.coord.lat}
          longitude={p.coord.lng}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelectSaved?.(p.id);
          }}
        >
          <button
            type="button"
            data-saved-marker={p.id}
            aria-label={`Saved: ${p.name}`}
            title={p.name}
            className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-amber-50 text-sm shadow"
          >
            {SAVED_ICONS[p.icon]}
          </button>
        </Marker>
      ))}

      {busStop && (
        <Marker latitude={busStop.lat} longitude={busStop.lng} anchor="bottom">
          <span
            role="img"
            aria-label="Bus stop"
            className="text-2xl drop-shadow"
          >
            🚏
          </span>
        </Marker>
      )}

      {labels.map(
        ({ index, at, text }) =>
          at && (
            <Marker
              key={`label-${index}`}
              longitude={at[0]}
              latitude={at[1]}
              anchor="bottom"
              style={{ zIndex: index === activeRoute ? 3 : 2 }}
            >
              <button
                type="button"
                data-route-label={
                  index === activeRoute ? "active" : "alternate"
                }
                aria-label={`${index === activeRoute ? "Selected route" : "Alternate route"}, ${text}`}
                aria-pressed={index === activeRoute}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRoute?.(index);
                }}
                className={`mb-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold shadow-md ring-1 ${
                  index === activeRoute
                    ? "bg-blue-600 text-white ring-blue-700"
                    : "bg-white text-slate-700 ring-slate-300"
                }`}
              >
                {active?.mode === "walk" ? "🚶 " : "🚗 "}
                {text}
              </button>
            </Marker>
          ),
      )}

      {ride && rideLabelAt && (
        <Marker
          longitude={rideLabelAt[0]}
          latitude={rideLabelAt[1]}
          anchor="bottom"
          style={{ zIndex: 3 }}
        >
          <span
            data-route-label="ride"
            className="mb-1 whitespace-nowrap rounded-lg bg-teal-700 px-2 py-1 text-xs font-semibold text-white shadow-md ring-1 ring-teal-900"
          >
            🚌 {ride.label ?? "bus"}
          </span>
        </Marker>
      )}

      {destination && (
        <Marker
          latitude={destination.lat}
          longitude={destination.lng}
          anchor="bottom"
        >
          <svg
            role="img"
            aria-label="Destination"
            width="28"
            height="38"
            viewBox="0 0 28 38"
            className="drop-shadow"
          >
            <path
              d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z"
              fill="#dc2626"
              stroke="#991b1b"
            />
            <circle cx="14" cy="14" r="5" fill="#7f1d1d" />
          </svg>
        </Marker>
      )}

      {origin && (
        <Marker latitude={origin.lat} longitude={origin.lng} anchor="center">
          <span
            role="img"
            aria-label="Starting point"
            className="block size-[18px] rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_6px_rgb(37_99_235/0.2),0_1px_4px_rgb(0_0_0/0.4)]"
          />
        </Marker>
      )}
    </MapGL>
  );
}
