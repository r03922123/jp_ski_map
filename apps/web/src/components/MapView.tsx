"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { type Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import MapGL, {
  Layer,
  type MapRef,
  Marker,
  NavigationControl,
  Source,
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
import {
  SKI_HIT_LAYER,
  type SkiLine,
  SkiLinesLayer,
} from "@/components/map/SkiLinesLayer";
import { TrailLayers } from "@/components/map/TrailLayers";
import { TripStopMarkers } from "@/components/map/TripStopMarkers";
import { PixelSprite } from "@/components/PixelSprite";
import type { Bbox, Coord, Place, Resort, Route } from "@/lib/api";
import { ICONS, type Pose } from "@/lib/game/sprites";
import {
  HAKUBA_VIEW,
  MAP_ATTRIBUTION,
  MAP_STYLE_URL,
  MAPLIBRE_WORKER_URL,
  TERRAIN_TILES,
} from "@/lib/map-config";
import type { Camera } from "@/lib/nav/camera";
import type { RideStopMark } from "@/lib/ride-stops";
import { type LngLat, MD_BREAKPOINT_PX, mapPadding } from "@/lib/route-geo";
import { safeInsets } from "@/lib/safe-insets";
import type { SavedMarker } from "@/lib/saved-places";
import { useCompactCredits } from "@/lib/use-compact-credits";
import { useMapCamera } from "@/lib/use-map-camera";
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
  /** The point for an open stop box (and a mouse click's point when there is no onDropPin). */
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
   * A mouse click, a touch long-press or a tap on a hotel pin drops a pin there. A click
   * or tap never edits the trip itself (Google Maps, docs/ux/behaviour-cards.md BC-A1).
   */
  onDropPin?: (coord: Coord, name: string | null) => void;
  /** Touch: a tap on the map that edits nothing (it closes the pin card). */
  onMapTap?: () => void;
  /** The dropped pin, drawn as Google's red pin (its card is MapShell's). */
  droppedPin?: { coord: Coord; name: string | null } | null;
  /** A tap or click on a run or lift (SPEC-ski-runs v1.1). */
  onSelectSkiLine?: (line: SkiLine) => void;
  /** The run or lift whose card is open: outlined on the map. */
  selectedSkiLineId?: string | null;
  /** The resort whose card is open: all its lines outlined (SPEC-ski-runs v1.4). */
  selectedSkiResortId?: string | null;
  /**
   * The open run, lift or resort card's whole lines (SPEC-ski-runs v1.5): framed clear of the
   * card once per `key`, and the route fit waits while it is set.
   */
  skiFocus?: { key: string; bounds: [LngLat, LngLat] } | null;
  /** The point picked on a run's height profile: a ring on the run. */
  profilePoint?: Coord | null;
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
const sizeOf = (map: HasCanvas) => {
  const canvas = map.getCanvas();
  return `${canvas.clientWidth}x${canvas.clientHeight}`;
};

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
  onSelectSkiLine,
  selectedSkiLineId = null,
  selectedSkiResortId = null,
  skiFocus = null,
  profilePoint = null,
  slimSheet = false,
  pilot = null,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  // routes can arrive before the map instance exists (shared URL); fit once it has
  const [mapReady, setMapReady] = useState(false);
  const gestures = useMapGestures({
    piloting: pilot !== null,
    placingStop,
    onSelectRoute,
    onPickOrigin,
    onDropPin,
    onMapTap,
    onSelectSkiLine,
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
  // the slim bar only moves the fit on a short phone: elsewhere (Saved toggling it) no refit
  const [canvasW, canvasH] = canvasSize.split("x").map(Number);
  const fitBottom = mapPadding({
    width: canvasW,
    height: canvasH,
    slimSheet,
    safe: safeInsets(),
  }).bottom;
  const fitKey = `${canvasSize}/${fitBottom}/${activeRoute}/${endPoints.join(";")}/${drawn
    .map(
      (r) =>
        `${r.mode}:${r.durationS}:${r.distanceM}:${r.geometry.coordinates.length}`,
    )
    .join("|")}`;
  const piloting = pilot !== null;

  useCompactCredits(mapRef, mapReady, fitKey);

  // A finger or mouse button down on the map. MapLibre's easeTo stops gesture handlers,
  // so an ease that starts mid-press (a GPS fix, the map finishing loading) would cancel
  // the swipe. The camera's eases wait for the release, then catch up; a press that became
  // a drag stops following.
  // The state decides the camera again on release; the ref is what it reads. A press can
  // land after React committed a new camera but before the camera's effect ran: React then
  // runs the effect first, with the old state, and the ease would start inside the press
  // (Task 67). The ref is set before React sees the press.
  const [pressing, setPressing] = useState(false);
  const pressed = useRef(false);
  // the map was resized under a finger that started on it (a phone turned): that touch
  // no longer points at what it started on, so its lift is no tap (see release). Only
  // that touch: both are cleared when it ends or is cancelled
  const mapTouch = useRef(false);
  const resizedUnderFinger = useRef(false);
  const press = () => {
    // any press on the map lets go of a search box, as in Google Maps: its suggestions
    // close and a phone's keyboard drops (a finger, unlike a mouse, moves no focus). Only
    // a box you type in: a focused radio or checkbox keeps its place in the Tab order
    const box = document.activeElement;
    if (
      box instanceof HTMLInputElement &&
      (box.type === "search" || box.type === "text")
    )
      box.blur();
    pressed.current = true;
    setPressing(true);
  };
  useEffect(() => {
    const release = (e?: Event) => {
      // a lifted finger with another still on the map is not a release
      // (no `instanceof TouchEvent`: desktop Firefox has no TouchEvent global)
      if (e && "touches" in e && (e as TouchEvent).touches.length > 0) return;
      // no tap: the browser would follow it with a mousedown on the map, which MapLibre
      // takes as a grab and stops the fit this release starts (the old fit stayed)
      // a touchend goes where its touch began: only the map finger's lift, not a second
      // finger's tap on the sheet
      if (
        e?.type === "touchend" &&
        resizedUnderFinger.current &&
        e.cancelable &&
        mapRef.current?.getContainer().contains(e.target as Node)
      )
        e.preventDefault();
      // pointerup comes before touchend: the touch isn't over yet
      if (e?.type !== "pointerup" && e?.type !== "mouseup") {
        mapTouch.current = false;
        resizedUnderFinger.current = false;
      }
      pressed.current = false;
      setPressing(false);
    };
    // touchend too: a touch sequence without pointer events (some WebViews, scripted
    // touches) would otherwise leave the map thinking a finger is still down
    // mouseup too: the mousedown a browser sends after a tap presses the map again
    const ends = [
      "mouseup",
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

  // A dropped pin's card must not open under the trip card on top or the sheet (v1.9).
  // Google eases the camera to a dropped pin (BC-A1); ours centres it in the clear part
  // of the map, once per pin.
  const pinKey = droppedPin
    ? `${droppedPin.coord.lat},${droppedPin.coord.lng}`
    : "";

  // Follow camera. Keyed on its values: usePilot hands over a new object every render,
  // and an identity-keyed ease would follow each of its own moveend reports.
  const cam = pilot?.following ? pilot.camera : null;
  const camKey = cam
    ? `${cam.center[0].toFixed(6)},${cam.center[1].toFixed(6)},${Math.round(cam.bearing)},${cam.pitch},${cam.zoom.toFixed(2)}`
    : "";

  useMapCamera(mapRef, {
    mapReady,
    piloting,
    pressed,
    pressing,
    route: {
      key: fitKey,
      lines: drawn.map((r) => r.geometry.coordinates as LngLat[]),
      ends: endPoints,
      slimSheet,
    },
    lone: lone && { key: loneKey, at: [lone.lng, lone.lat] },
    flyTo,
    pin: droppedPin && {
      key: pinKey,
      at: [droppedPin.coord.lng, droppedPin.coord.lat],
    },
    ski: skiFocus,
    follow: cam && { key: camKey, camera: cam },
  });

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

  return (
    <MapGL
      ref={mapRef}
      initialViewState={HAKUBA_VIEW}
      mapStyle={MAP_STYLE_URL}
      style={{ position: "absolute", inset: 0, zIndex: 0 }}
      attributionControl={{
        customAttribution: MAP_ATTRIBUTION,
        // MapLibre's own cut-off is 640 px, but the sheet covers the corner up to `md`
        compact: window.innerWidth < MD_BREAKPOINT_PX || undefined,
      }}
      interactiveLayerIds={[LODGING_LAYER, ALT_HIT_LAYER, SKI_HIT_LAYER]}
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
        else if (mapTouch.current) {
          resizedUnderFinger.current = true;
          gestures.endHold(); // nor a long-press: turning the phone drops no pin
        }
      }}
      onMoveEnd={(e: ViewStateChangeEvent) => reportView(e.target)}
      onStyleData={(e) => keepRouteLayerOrder(e.target)}
      onDragStart={() => pilot?.onUserMove()}
      // wired when the map is created, so a press during loading counts too
      onMouseDown={press}
      onTouchStart={(e) => {
        mapTouch.current = true;
        resizedUnderFinger.current = false;
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
        <Marker
          longitude={droppedPin.coord.lng}
          latitude={droppedPin.coord.lat}
          anchor="bottom"
          // above every other marker (they use z-index 1–5); a tap on it reaches the map
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <DroppedPin />
        </Marker>
      )}
      {profilePoint && (
        <Marker
          longitude={profilePoint.lng}
          latitude={profilePoint.lat}
          // a tap on it reaches the map; above the run, under the dropped pin
          style={{ zIndex: 5, pointerEvents: "none" }}
        >
          <span
            data-profile-ring
            aria-hidden="true"
            className="block size-5 rounded-full border-[3px] border-foreground bg-white/50 shadow-[0_0_0_2px_white]"
          />
        </Marker>
      )}
      {/* relief, as OpenSkiMap draws it: above land cover, under water, roads and labels */}
      <Source
        id="terrain"
        type="raster-dem"
        tiles={[TERRAIN_TILES]}
        encoding="terrarium"
        tileSize={512}
        // Hakuba has no tile past z16 (404s); z12 (~19 m a pixel) is detail enough for
        // shading, and each tile is ~190 KB
        maxzoom={12}
      >
        <Layer
          id="hillshade"
          type="hillshade"
          beforeId="waterway_tunnel"
          paint={{ "hillshade-exaggeration": 0.3 }}
        />
      </Source>
      <LodgingLayer lodging={lodging} />
      <SkiLinesLayer
        selectedId={selectedSkiLineId}
        selectedResortId={selectedSkiResortId}
      />
      <AlternateRoutes routes={routes} activeRoute={activeRoute} />
      {/* Route layers stay mounted, empty when unused, so MapLibre stacks them in this
          fixed order (it stacks by when a layer was added): bus line under the walk
          route, then the part already covered, the step highlight, and the bus
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

/** Google's red dropped pin, at its size (27 × 43 px), its tip on the spot. */
function DroppedPin() {
  return (
    <svg
      data-dropped-pin
      aria-hidden="true"
      width="27"
      height="43"
      viewBox="0 0 27 43"
      className="drop-shadow-md"
    >
      <path
        d="M13.5 0C6 0 0 6 0 13.4 0 23.5 13.5 43 13.5 43S27 23.5 27 13.4C27 6 21 0 13.5 0Z"
        fill="#EA4335"
        stroke="#B31412"
      />
      <circle cx="13.5" cy="13.5" r="5" fill="#B31412" />
    </svg>
  );
}
