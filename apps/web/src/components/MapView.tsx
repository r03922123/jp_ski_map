"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  type MapGeoJSONFeature,
  type Map as MapLibreMap,
  setWorkerUrl,
} from "maplibre-gl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapRef,
  type MapTouchEvent,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { facesLeft, Hero } from "@/components/HeroMarker";
import { PixelSprite } from "@/components/PixelSprite";
import type { Bbox, Coord, Place, Resort, Route } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { ICONS, type Pose, worldBadge } from "@/lib/game/sprites";
import { useGameStyle } from "@/lib/game/use-game-style";
import { worldNumbers } from "@/lib/game/worlds";
import {
  HAKUBA_VIEW,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";
import type { Camera } from "@/lib/nav/camera";
import { type RideStopMark, rideStopFeatures } from "@/lib/ride-stops";
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
  ride: { route: Route; stops: RideStopMark[]; label: string | null } | null;
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
  stops?: { coord: Coord; name: string }[];
  /** A stop box is open: a tap places the stop, even on a route line. */
  placingStop?: boolean;
  /**
   * Touch: a long-press on the map (or a tap on a hotel pin) drops a pin there. On touch a
   * tap never edits the trip (Google Maps, docs/ux/behaviour-cards.md BC-A1).
   */
  onDropPin?: (coord: Coord, name: string | null) => void;
  /** Touch: a tap on the map that edits nothing (it closes the pin card). */
  onMapTap?: () => void;
  /** The dropped pin, with its card (`pinCard`) drawn at it. */
  droppedPin?: { coord: Coord; name: string | null } | null;
  pinCard?: ReactNode;
  /** Turn-by-turn mode (SPEC-pilot): follow camera, position puck, covered part grey. */
  pilot?: {
    camera: Camera | null;
    puck: LngLat | null;
    heading: number | null;
    covered: LngLat[];
    following: boolean;
    /** the user dragged the map: stop following until they re-centre */
    onUserMove: () => void;
    /** the rider's pose (SPEC-game-theme) */
    pose: Pose;
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
// MapLibre's own double-click needs both clicks well inside this; OSes default to ~500 ms,
// but a longer wait makes every single pick feel late
const DOUBLE_CLICK_MS = 300;
/** Touch long-press: UIKit's default hold (0.5 s) and allowable movement (10 pt). */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
/** A click this soon after a touch ended was made by that finger (the mouse never touches). */
const TOUCH_CLICK_MS = 700;
const ALT_HIT_LAYER = "route-alts-hit";

// SPEC-game-theme: the chosen route is an overworld trail
const TRAIL_INK = "#22223a";
const TRAIL_GOLD = "#ffd25e";
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
  "ride-stop-names",
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
  onDropPin,
  onMapTap,
  droppedPin = null,
  pinCard,
  pilot = null,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = useGameStyle(MAP_STYLE_URL);
  const worlds = useMemo(() => worldNumbers(resorts), [resorts]);
  // routes can arrive before the map instance exists (shared URL); fit once it has
  const [mapReady, setMapReady] = useState(false);
  // A double-click (double-tap) zooms; its first click must not also move the start.
  // A pick waits out the double-click window, and a second click inside it cancels it.
  const pendingPick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPick = () => {
    if (pendingPick.current === null) return false;
    clearTimeout(pendingPick.current);
    pendingPick.current = null;
    return true;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: cancelPick only reads a ref
  useEffect(() => () => void cancelPick(), []);

  // Touch long-press, with the platform defaults: UIKit's long press (0.5 s, 10 pt of
  // allowable movement) and Android's long-press timeout. A second finger is a pinch, a
  // finger that travels is a pan; neither drops a pin.
  const hold = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const longPressed = useRef(false); // its lift-off click belongs to the press
  const lastTouch = useRef(0); // a click this soon after a touch came from a finger
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: endHold only reads a ref
  useEffect(() => () => endHold(), []);
  // react-map-gl 8 sets `features` on touch events too (its _onPointerEvent queries
  // the interactive layers for every pointer event); only its types leave it out
  const startHold = (e: MapTouchEvent & { features?: MapGeoJSONFeature[] }) => {
    endHold();
    lastTouch.current = Date.now();
    longPressed.current = false;
    if (e.points.length !== 1 || pilot !== null || !onDropPin) return;
    // pressed on a hotel pin: the card is about that hotel (its spot and name)
    const hotel = e.features?.find((f) => f.layer.id === LODGING_LAYER);
    const geom = hotel?.geometry;
    const coord: Coord =
      geom?.type === "Point"
        ? { lat: geom.coordinates[1], lng: geom.coordinates[0] }
        : { lat: e.lngLat.lat, lng: e.lngLat.lng };
    const name =
      geom?.type === "Point"
        ? ((hotel?.properties?.name as string) ?? null)
        : null;
    hold.current = {
      x: e.point.x,
      y: e.point.y,
      timer: setTimeout(() => {
        hold.current = null;
        longPressed.current = true;
        onDropPin(coord, name);
      }, LONG_PRESS_MS),
    };
  };
  const moveHold = (e: MapTouchEvent) => {
    const h = hold.current;
    if (!h) return;
    if (
      e.points.length !== 1 ||
      Math.hypot(e.point.x - h.x, e.point.y - h.y) > LONG_PRESS_SLOP_PX
    )
      endHold();
  };

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

  // A finger or mouse button down on the map. MapLibre's easeTo stops gesture handlers,
  // so an ease that starts mid-press (a GPS fix, the map finishing loading) would cancel
  // the swipe. The follow camera waits for the release, then catches up, unless the press
  // became a drag, which stops following.
  // The state re-runs the follow camera on release; the ref is what it reads. A press can
  // land after React committed a new camera but before that effect ran: React then runs
  // the effect first, with the old state, and the ease would start inside the press
  // (Task 67). The ref is set before React sees the press.
  const [pressing, setPressing] = useState(false);
  const pressed = useRef(false);
  const press = () => {
    pressed.current = true;
    setPressing(true);
  };
  useEffect(() => {
    const release = () => {
      pressed.current = false;
      setPressing(false);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  // Follow camera. Keyed on its values: usePilot hands over a new object every render,
  // and an identity-keyed effect would re-ease after each of its own moveend reports.
  const cam = pilot?.following ? pilot.camera : null;
  const camKey = cam
    ? `${cam.center[0].toFixed(6)},${cam.center[1].toFixed(6)},${Math.round(cam.bearing)},${cam.pitch},${cam.zoom.toFixed(2)}`
    : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: camKey stands for `cam`
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !cam || pressed.current) return;
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
  }, [camKey, mapReady, pressing]);

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
    () => rideStopFeatures(ride?.stops ?? []),
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

  if (!mapStyle) return null; // the overworld style loads first (one fetch, as MapLibre would)
  return (
    <MapGL
      ref={mapRef}
      initialViewState={HAKUBA_VIEW}
      mapStyle={mapStyle}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
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
      // wired when the map is created, so a press during loading counts too
      onMouseDown={press}
      onTouchStart={(e) => {
        press();
        startHold(e);
      }}
      onTouchMove={moveHold}
      onTouchEnd={() => {
        endHold();
        lastTouch.current = Date.now();
      }}
      onTouchCancel={endHold}
      onClick={(e) => {
        const feature = e.features?.[0];
        // a route line selects that route, unless a stop is being placed: a stop along
        // the way is the likeliest tap then
        if (feature?.layer.id === ALT_HIT_LAYER && !placingStop) {
          onSelectRoute?.(Number(feature.properties?.index));
          return;
        }
        // navigating (or previewing): the pilot owns the map, a tap must not replace
        // the trip being followed with a new start
        if (piloting) return;
        // the click that ends a long-press: the press already dropped its pin
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        // the second click of a double-click: it zooms, nothing is picked
        if (cancelPick() || e.originalEvent.detail > 1) return;
        // a lodging pin snaps the origin onto the hotel itself
        const pin = feature?.geometry;
        const at: Coord =
          pin?.type === "Point"
            ? { lat: pin.coordinates[1], lng: pin.coordinates[0] }
            : { lat: e.lngLat.lat, lng: e.lngLat.lng };
        // a finger looks, it doesn't edit (BC-A1): a hotel pin opens its card, empty map
        // closes one. An open stop box is the exception: the user asked for a point.
        const byFinger = Date.now() - lastTouch.current < TOUCH_CLICK_MS;
        if (byFinger && onDropPin && !placingStop) {
          if (pin?.type === "Point")
            onDropPin(at, (feature?.properties?.name as string) ?? null);
          else onMapTap?.();
          return;
        }
        pendingPick.current = setTimeout(() => {
          pendingPick.current = null;
          onPickOrigin(at);
        }, DOUBLE_CLICK_MS);
      }}
      onDblClick={() => cancelPick()}
    >
      <NavigationControl position="bottom-right" />
      {droppedPin && (
        <Popup
          longitude={droppedPin.coord.lng}
          latitude={droppedPin.coord.lat}
          // no fixed anchor: MapLibre puts the card on whichever side of the pin keeps
          // it inside the map, so a pin near an edge never cuts off ✕ or Go here (S6)
          closeButton={false}
          closeOnClick={false}
          maxWidth="280px"
        >
          {pinCard}
        </Popup>
      )}
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
      {resorts.map((r) => {
        const point = r.accessPoints[0];
        const selected = r.id === selectedResortId;
        return (
          <Marker
            key={r.id}
            latitude={point.coord.lat}
            longitude={point.coord.lng}
            anchor="bottom"
            // labels stay readable above the idle hero (z auto), and the chosen world's
            // chip stays above the destination flag on the same spot
            style={{ zIndex: selected ? 2 : 1 }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              if (!piloting) onSelectResort(r.id); // navigating: the trip stays
            }}
          >
            <button
              type="button"
              aria-label={r.name.en}
              aria-pressed={selected}
              data-resort-marker={r.id}
              className={`flex items-center gap-1 border-2 border-[var(--ink)] py-0.5 pr-1.5 pl-0.5 text-xs shadow-[2px_2px_0_var(--ink)] ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-card-foreground"
              }`}
            >
              <PixelSprite
                id={`world-${worlds.get(r.id)}`}
                sprite={worldBadge(worlds.get(r.id) ?? 0)}
                scale={1.5}
                alt=""
              />
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
          // the rider stands on the spot: feet at the position, never rotated
          anchor="bottom"
          // not interactive: a drag that starts on your own position must pan the map
          // on top of everything, and never in the way of a tap
          style={{ zIndex: 5, pointerEvents: "none" }}
        >
          <Hero
            pose={pilot.pose}
            left={facesLeft(pilot.heading, pilot.camera?.bearing ?? 0)}
            alt="Your position"
            scale={2} // a tilted navigation map: big enough to find at a glance
          />
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
            if (!piloting) onSelectSaved?.(p.id); // navigating: the trip stays
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
      {stops.map((stop, i) => (
        <Marker
          // biome-ignore lint/suspicious/noArrayIndexKey: a stop is its position in the trip
          key={`trip-stop-${i}`}
          latitude={stop.coord.lat}
          longitude={stop.coord.lng}
          anchor="center"
          // above the route time chips (3): a chip can land right on a stop
          style={{ zIndex: 4 }}
          // a tap on a stop must not fall through to the map (moving the start, or
          // dropping a second stop on top of it)
          onClick={(e) => e.originalEvent.stopPropagation()}
        >
          <span
            role="img"
            aria-label={`Stop ${i + 1}: ${stop.name}`}
            data-trip-stop={i + 1}
            className="flex size-6 items-center justify-center rounded-full border-2 border-slate-800 bg-white text-xs font-bold shadow"
          >
            {i + 1}
          </span>
        </Marker>
      ))}
      {busStop && (
        <Marker latitude={busStop.lat} longitude={busStop.lng} anchor="bottom">
          <PixelSprite id="stop" sprite={ICONS.stop} alt="Bus stop" />
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
                className={`mb-1 whitespace-nowrap border-2 border-[var(--ink)] px-2 py-1 text-xs shadow-[2px_2px_0_var(--ink)] ${
                  index === activeRoute
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground"
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
          style={{ zIndex: 3, pointerEvents: "none" }}
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
          // nothing to tap: a press here is a press on the map (a pan must start)
          style={{ zIndex: 1, pointerEvents: "none" }}
        >
          <PixelSprite id="flag" sprite={ICONS.flag} alt="Destination" />
        </Marker>
      )}
      {origin && (
        <Marker
          latitude={origin.lat}
          longitude={origin.lng}
          anchor={pilot ? "center" : "bottom"}
          // nothing to tap: a press here is a press on the map (a pan must start)
          style={{ pointerEvents: "none" }}
        >
          {pilot ? (
            <span
              role="img"
              aria-label="Starting point"
              className="block size-[18px] rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_6px_rgb(37_99_235/0.2),0_1px_4px_rgb(0_0_0/0.4)]"
            />
          ) : (
            <Hero pose="idle" alt="Starting point" />
          )}
        </Marker>
      )}
    </MapGL>
  );
}
