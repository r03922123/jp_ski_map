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
import type { Camera } from "@/lib/nav/camera";
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
  /** The trip's stops, in order (numbered 1, 2, …). */
  stops?: Coord[];
  /** A stop box is open: a tap places the stop, even on a route line. */
  placingStop?: boolean;
  /** Turn-by-turn mode (SPEC-pilot): follow camera, position puck, covered part grey. */
  pilot?: {
    camera: Camera | null;
    puck: LngLat | null;
    heading: number | null;
    covered: LngLat[];
    following: boolean;
    /** the user dragged the map: stop following until they re-centre */
    onUserMove: () => void;
  } | null;
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

const EMPTY = { type: "FeatureCollection" as const, features: [] };

/**
 * Bottom-to-top order of our route layers. react-map-gl adds layers asynchronously (when
 * their source is ready), so the order they land in can differ from the JSX order; this
 * is re-applied on every style change, moving layers only when one is out of place.
 */
export const ROUTE_LAYER_ORDER = [
  "route-alts-casing",
  "route-alts-line",
  "route-alts-hit",
  "ride-casing",
  "ride-line",
  "route-active-casing",
  "route-active-line",
  "route-covered-line",
  "route-highlight-line",
  "ride-stop-dots",
];

export function keepRouteLayerOrder(map: MapLibreMap): void {
  const present = ROUTE_LAYER_ORDER.filter((id) => map.getLayer(id));
  const drawn = (map.getStyle()?.layers ?? [])
    .map((l) => l.id)
    .filter((id) => present.includes(id));
  if (drawn.join() === present.join()) return;
  for (const id of present) map.moveLayer(id); // each to the top, bottom one first
}

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
  stops = [],
  placingStop = false,
  pilot = null,
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
  const piloting = pilot !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey stands for `drawn`
  useEffect(() => {
    const map = mapRef.current;
    // while navigating the follow camera owns the view (a reroute must not zoom out)
    if (!mapReady || !map || drawn.length === 0 || piloting) return;
    const all = drawn.flatMap((r) => r.geometry.coordinates as LngLat[]);
    if (all.length < 2) return;
    const canvas = map.getCanvas();
    map.fitBounds(routeBounds(all), {
      padding: mapPadding({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      }),
      maxZoom: 16,
      pitch: 0,
      bearing: 0,
      duration: prefersReducedMotion() ? 0 : 700,
    });
  }, [fitKey, mapReady, piloting]);

  // Follow camera. Keyed on its values: usePilot hands over a new object every render,
  // and an identity-keyed effect would re-ease after each of its own moveend reports.
  const cam = pilot?.following ? pilot.camera : null;
  const camKey = cam
    ? `${cam.center[0].toFixed(6)},${cam.center[1].toFixed(6)},${Math.round(cam.bearing)},${cam.pitch},${cam.zoom.toFixed(2)}`
    : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: camKey stands for `cam`
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !cam) return;
    map.easeTo({
      center: cam.center,
      bearing: cam.bearing,
      pitch: cam.pitch,
      zoom: cam.zoom,
      // the puck sits in the lower part of the screen, the road ahead above it
      padding: {
        top: map.getCanvas().clientHeight * 0.4,
        bottom: 0,
        left: 0,
        right: 0,
      },
      duration: prefersReducedMotion() ? 0 : 900,
    });
  }, [camKey, mapReady]);

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
          'Snow: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> | Shuttle: <a href="https://www.hakubavalley.com/en/access_en/shuttlebus_en/" target="_blank" rel="noopener">Hakuba Valley</a> | Places: <a href="https://overturemaps.org/" target="_blank" rel="noopener">Overture Maps Foundation</a>',
      }}
      interactiveLayerIds={[LODGING_LAYER, ALT_HIT_LAYER]}
      onLoad={(e) => {
        // e2e checks what is actually drawn (layer order, rendered stop dots)
        if (process.env.NODE_ENV !== "production") {
          Object.assign(window, { __hakubaMap: e.target });
        }
        reportView(e.target);
        setMapReady(true);
        onLoad?.();
      }}
      onMoveEnd={(e: ViewStateChangeEvent) => reportView(e.target)}
      onStyleData={(e) => keepRouteLayerOrder(e.target)}
      onDragStart={() => pilot?.onUserMove()}
      onClick={(e) => {
        const feature = e.features?.[0];
        // a route line selects that route, unless a stop is being placed: a stop along
        // the way is the likeliest tap then
        if (feature?.layer.id === ALT_HIT_LAYER && !placingStop) {
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

      {/* Route layers stay mounted, empty when unused, so MapLibre stacks them in this
          fixed order (it stacks by when a layer was added): bus line under the walk or
          drive route, then the part already covered, the step highlight, and the bus
          stop dots on top. */}
      <Source
        id="ride"
        type="geojson"
        data={ride ? ride.route.geometry : EMPTY}
      >
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

      <Source
        id="route-active"
        type="geojson"
        data={active ? active.geometry : EMPTY}
      >
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

      <Source
        id="route-covered"
        type="geojson"
        data={
          pilot && pilot.covered.length > 1
            ? {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: pilot.covered },
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

      {pilot?.puck && (
        <Marker
          longitude={pilot.puck[0]}
          latitude={pilot.puck[1]}
          anchor="center"
          rotation={pilot.heading ?? 0}
          rotationAlignment="map"
          pitchAlignment="map"
          // not interactive: a drag that starts on your own position must pan the map
          style={{ zIndex: 4, pointerEvents: "none" }}
        >
          <svg
            role="img"
            aria-label="Your position"
            width="34"
            height="34"
            viewBox="0 0 34 34"
            className="drop-shadow"
          >
            <circle cx="17" cy="17" r="15" fill="#ffffff" />
            <path d="M17 5 L26 27 L17 22 L8 27 Z" fill="#2563eb" />
          </svg>
        </Marker>
      )}

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

      {stops.map((c, i) => (
        <Marker
          // biome-ignore lint/suspicious/noArrayIndexKey: a stop is its position in the trip
          key={`trip-stop-${i}`}
          latitude={c.lat}
          longitude={c.lng}
          anchor="center"
          style={{ zIndex: 3 }}
        >
          <span
            role="img"
            aria-label={`Stop ${i + 1}`}
            data-trip-stop={i + 1}
            className="flex size-6 items-center justify-center rounded-full border-2 border-slate-800 bg-white text-xs font-bold shadow"
          >
            {i + 1}
          </span>
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
          at &&
          !piloting && (
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

      {ride && rideLabelAt && !piloting && (
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
