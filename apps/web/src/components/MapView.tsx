"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import MapGL, {
  type MapRef,
  Marker,
  NavigationControl,
  Popup,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import { facesLeft, Hero } from "@/components/HeroMarker";
import {
  ALT_HIT_LAYER,
  AlternateRoutes,
} from "@/components/map/AlternateRoutes";
import {
  BoardingStop,
  RideLabel,
  RideLine,
  RideStops,
} from "@/components/map/BusRide";
import { LODGING_LAYER, LodgingLayer } from "@/components/map/LodgingLayer";
import { ResortMarkers } from "@/components/map/ResortMarkers";
import { RouteLabels } from "@/components/map/RouteLabels";
import { SavedMarkers } from "@/components/map/SavedMarkers";
import { TrailLayers } from "@/components/map/TrailLayers";
import { TripStopMarkers } from "@/components/map/TripStopMarkers";
import { PixelSprite } from "@/components/PixelSprite";
import type { Bbox, Coord, Place, Resort, Route } from "@/lib/api";
import { ICONS, type Pose } from "@/lib/game/sprites";
import { useGameStyle } from "@/lib/game/use-game-style";
import {
  HAKUBA_VIEW,
  MAP_ATTRIBUTION,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
} from "@/lib/map-config";
import type { Camera } from "@/lib/nav/camera";
import type { RideStopMark } from "@/lib/ride-stops";
import {
  type LngLat,
  MD_BREAKPOINT_PX,
  mapPadding,
  pinCardAnchor,
  pinEaseOffsetY,
  routeBounds,
} from "@/lib/route-geo";
import type { SavedMarker } from "@/lib/saved-places";
import { useCompactCredits } from "@/lib/use-compact-credits";
import { useMapGestures } from "@/lib/use-map-gestures";

setWorkerUrl(MAPLIBRE_WORKER_URL);

export type MapViewProps = {
  resorts: Resort[];
  /** Which resorts keep a label; every one when absent. Numbers still count them all. */
  shownResortIds?: string[];
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
  /** The sheet is a slim ETA + Start bar on a landscape phone (BottomSheet `slim`). */
  slimSheet?: boolean;
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

type HasCanvas = Pick<MapLibreMap, "getCanvas">;
const paddingOf = (map: HasCanvas, slimSheet = false) => {
  const canvas = map.getCanvas();
  return mapPadding({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    slimSheet,
  });
};
const sizeOf = (map: HasCanvas) => {
  const canvas = map.getCanvas();
  return `${canvas.clientWidth}x${canvas.clientHeight}`;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MapView({
  resorts,
  shownResortIds,
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
  slimSheet = false,
  pilot = null,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = useGameStyle(MAP_STYLE_URL);
  // routes can arrive before the map instance exists (shared URL); fit once it has
  const [mapReady, setMapReady] = useState(false);
  const gestures = useMapGestures({
    piloting: pilot !== null,
    placingStop,
    onSelectRoute,
    onPickOrigin,
    onDropPin,
    onMapTap,
  });

  // Fit the whole route set once per new search or picked option, clear of the directions
  // panel. Keyed on what is drawn, not on prop identity: a parent re-render (e.g. after
  // this map reports a pan) must never re-fit, or the user can't pan at all. The size
  // counts because a resized window or a rotated phone moves the panels.
  const [canvasSize, setCanvasSize] = useState("");
  // the markers stand at the true points, which the route only reaches at the nearest road
  const endPoints = [origin, destination, busStop].flatMap((p) =>
    p ? [[p.lng, p.lat] as LngLat] : [],
  );
  const drawn = [...routes, ...(ride ? [ride.route] : [])];
  const fitKey = `${canvasSize}/${slimSheet}/${activeRoute}/${endPoints.join(";")}/${drawn
    .map(
      (r) =>
        `${r.mode}:${r.durationS}:${r.distanceM}:${r.geometry.coordinates.length}`,
    )
    .join("|")}`;
  const piloting = pilot !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitKey stands for `drawn`
  useEffect(() => {
    const map = mapRef.current;
    // while navigating the follow camera owns the view (a reroute must not zoom out)
    if (!mapReady || !map || drawn.length === 0 || piloting) return;
    const all = [
      ...drawn.flatMap((r) => r.geometry.coordinates as LngLat[]),
      ...endPoints,
    ];
    if (all.length < 2) return;
    map.fitBounds(routeBounds(all), {
      padding: paddingOf(map, slimSheet),
      // replaces what navigation or a dropped pin left on the map: added to that, the
      // padding can exceed the map, and the fit silently does nothing
      absolutePadding: true,
      maxZoom: 16,
      pitch: 0,
      bearing: 0,
      duration: prefersReducedMotion() ? 0 : 700,
    });
  }, [fitKey, mapReady, piloting]);

  useCompactCredits(mapRef, mapReady, fitKey);

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
    const release = (e?: Event) => {
      // a lifted finger with another still on the map is not a release
      // (no `instanceof TouchEvent`: desktop Firefox has no TouchEvent global)
      if (e && "touches" in e && (e as TouchEvent).touches.length > 0) return;
      pressed.current = false;
      setPressing(false);
    };
    // touchend too: a touch sequence without pointer events (some WebViews, scripted
    // touches) would otherwise leave the map thinking a finger is still down
    const ends = [
      "pointerup",
      "pointercancel",
      "touchend",
      "touchcancel",
      "blur",
    ];
    for (const e of ends) window.addEventListener(e, release);
    return () => {
      for (const e of ends) window.removeEventListener(e, release);
    };
  }, []);

  // A resize under a finger waits for the finger to lift (see onResize).
  useEffect(() => {
    const map = mapRef.current;
    if (mapReady && map && !pressing) setCanvasSize(sizeOf(map));
  }, [pressing, mapReady]);

  // One end and no route yet: nothing to fit, so if a panel has it, bring it into the
  // clear part, once per place and window size (afterwards the user may pan it away).
  const lone = origin && !destination ? origin : !origin ? destination : null;
  const loneKey = lone ? `${lone.lng},${lone.lat}/${canvasSize}` : "";
  const easedLone = useRef("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: loneKey stands for lone
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !lone || piloting || pressing) return;
    if (easedLone.current === loneKey) return;
    easedLone.current = loneKey;
    const pad = paddingOf(map);
    const canvas = map.getCanvas();
    const { x, y } = map.project([lone.lng, lone.lat]);
    const inClear =
      x >= pad.left &&
      x <= canvas.clientWidth - pad.right &&
      y >= pad.top &&
      y <= canvas.clientHeight - pad.bottom;
    if (inClear) return;
    map.easeTo({
      center: [lone.lng, lone.lat],
      padding: pad,
      duration: prefersReducedMotion() ? 0 : 600,
    });
  }, [loneKey, mapReady, piloting, pressing]);

  // After the effect above, whose ease a search's flight must replace.
  useEffect(() => {
    if (flyTo) {
      const map = mapRef.current;
      if (map)
        map.flyTo({
          center: [flyTo.lng, flyTo.lat],
          zoom: 14,
          padding: paddingOf(map),
        });
    }
  }, [flyTo]);

  // A dropped pin's card must not open under the trip card on top or the sheet (v1.9).
  // Google eases the camera to a dropped pin (BC-A1); ours centres it in the clear part
  // of the map, once per pin, after the finger is up (an ease inside a press cancels
  // MapLibre's gestures, see above).
  const pinKey = droppedPin
    ? `${droppedPin.coord.lat},${droppedPin.coord.lng}`
    : "";
  const easedPin = useRef("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: pinKey stands for droppedPin
  useEffect(() => {
    const map = mapRef.current;
    if (!pinKey) {
      easedPin.current = "";
      return;
    }
    if (!mapReady || !map || !droppedPin || pressing) return;
    if (easedPin.current === pinKey) return;
    easedPin.current = pinKey;
    map.easeTo({
      center: [droppedPin.coord.lng, droppedPin.coord.lat],
      padding: paddingOf(map),
      offset: [
        0,
        pinEaseOffsetY({
          width: map.getCanvas().clientWidth,
          height: map.getCanvas().clientHeight,
        }),
      ],
      duration: prefersReducedMotion() ? 0 : 600,
    });
  }, [pinKey, pressing, mapReady]);

  const pinMap = mapRef.current;
  const pinAt =
    pinMap && droppedPin
      ? pinMap.project([droppedPin.coord.lng, droppedPin.coord.lat])
      : null;
  const pinAnchor =
    pinMap && pinAt
      ? pinCardAnchor({
          x: pinAt.x,
          y: pinAt.y,
          width: pinMap.getCanvas().clientWidth,
          height: pinMap.getCanvas().clientHeight,
        })
      : undefined;

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
        customAttribution: MAP_ATTRIBUTION,
        // MapLibre's own cut-off is 640 px, but the sheet covers the corner up to `md`
        compact: window.innerWidth < MD_BREAKPOINT_PX || undefined,
      }}
      interactiveLayerIds={[LODGING_LAYER, ALT_HIT_LAYER]}
      onLoad={(e) => {
        // e2e checks what is actually drawn (layer order, rendered stop dots)
        if (process.env.NODE_ENV !== "production") {
          Object.assign(window, { __hakubaMap: e.target });
        }
        reportView(e.target);
        setCanvasSize(sizeOf(e.target));
        setMapReady(true);
        onLoad?.();
      }}
      // not under a finger: a re-fit must never pull the map away mid-gesture
      onResize={(e) => {
        if (!pressed.current) setCanvasSize(sizeOf(e.target));
      }}
      onMoveEnd={(e: ViewStateChangeEvent) => reportView(e.target)}
      onStyleData={(e) => keepRouteLayerOrder(e.target)}
      onDragStart={() => pilot?.onUserMove()}
      // wired when the map is created, so a press during loading counts too
      onMouseDown={press}
      onTouchStart={(e) => {
        press();
        gestures.startHold(e);
      }}
      onTouchMove={gestures.moveHold}
      onTouchEnd={gestures.touchEnd}
      onTouchCancel={gestures.endHold}
      onClick={gestures.click}
      onDblClick={() => gestures.cancelPick()}
    >
      <NavigationControl position="bottom-right" />
      {droppedPin && (
        <Popup
          longitude={droppedPin.coord.lng}
          latitude={droppedPin.coord.lat}
          // no fixed anchor: MapLibre puts the card on whichever side of the pin keeps
          // it inside the map, so a pin near an edge never cuts off ✕ or Go here (S6).
          // Except under the trip card on top, which MapLibre doesn't know about
          anchor={pinAnchor}
          closeButton={false}
          closeOnClick={false}
          maxWidth="280px"
          // above every marker (they use z-index 1–5): on a real iPad a resort marker
          // painted over the card's middle, where a tap would choose that resort
          style={{ zIndex: 10 }}
        >
          {pinCard}
        </Popup>
      )}
      <LodgingLayer lodging={lodging} />
      <AlternateRoutes routes={routes} activeRoute={activeRoute} />
      {/* Route layers stay mounted, empty when unused, so MapLibre stacks them in this
          fixed order (it stacks by when a layer was added): bus line under the walk or
          drive route, then the part already covered, the step highlight, and the bus
          stop dots on top. */}
      <RideLine route={ride?.route ?? null} />
      <TrailLayers
        active={active}
        covered={pilot?.covered ?? null}
        highlight={highlight}
      />
      <RideStops stops={ride?.stops} />
      <ResortMarkers
        resorts={resorts}
        shownResortIds={shownResortIds}
        selectedResortId={selectedResortId}
        piloting={piloting}
        onSelectResort={onSelectResort}
      />
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

      <SavedMarkers
        saved={saved}
        piloting={piloting}
        onSelectSaved={onSelectSaved}
      />
      <TripStopMarkers stops={stops} />
      <BoardingStop at={busStop} />
      <RouteLabels
        routes={routes}
        activeRoute={activeRoute}
        piloting={piloting}
        onSelectRoute={onSelectRoute}
      />
      <RideLabel ride={ride} piloting={piloting} />
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
