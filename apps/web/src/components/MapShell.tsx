"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { DestinationPicker } from "@/components/DestinationPicker";
import { DrivePanel, type RankingState } from "@/components/DrivePanel";
import { ImportDialog } from "@/components/ImportDialog";
import {
  ModePanel,
  type PanelMode,
  type RouteState,
} from "@/components/ModePanel";
import { PilotView } from "@/components/PilotView";
import { PlaceStrip } from "@/components/PlaceStrip";
import { PoiList, type PoiListState } from "@/components/PoiList";
import { SavedPanel } from "@/components/SavedPanel";
import { SearchBox } from "@/components/SearchBox";
import {
  ApiError,
  type Bbox,
  type BusOption,
  type Coord,
  fetchBusOptions,
  fetchLodging,
  fetchNearbyPois,
  fetchNightBus,
  fetchPath,
  fetchRank,
  fetchResorts,
  fetchRoutes,
  type Route,
} from "@/lib/api";
import { formatDuration } from "@/lib/format";
import {
  buzz,
  dueAnnouncement,
  loadMuted,
  primeSpeech,
  saveMuted,
  speak,
} from "@/lib/nav/announce";
import {
  geolocationSource,
  type PositionSource,
  simulatedSource,
} from "@/lib/nav/position";
import { splitAt } from "@/lib/nav/project";
import { usePilot } from "@/lib/nav/use-pilot";
import { useReroute } from "@/lib/nav/use-reroute";
import type { LngLat } from "@/lib/route-geo";
import {
  hotelOf,
  kindFromSuggestion,
  type PlaceInput,
  pinId,
  placeAt,
  type SavedPlace,
  savedStore,
  useSaved,
  visibleMarkers,
} from "@/lib/saved-places";
import { readImportHash } from "@/lib/saved-share";
import {
  DEFAULT_RANK,
  type DestinationCategory,
  parseViewState,
  type RankOptions,
  serializeViewState,
} from "@/lib/url-state";
import { useHiddenTimeout, useWakeLock } from "@/lib/wake-lock";

/** Stop navigating after the page has been hidden this long (SPEC-pilot boundaries). */
const PILOT_HIDDEN_STOP_MS = 10 * 60_000;
/** `?simulate` (dev builds only): replay the route at these speeds instead of GPS. */
const SIMULATED_MPS = { drive: 15, walk: 5 } as const;

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

const LODGING_MIN_ZOOM = 14;

/** Current Hakuba time as "YYYY-MM-DDTHH:mm" for the datetime-local input. */
function nowInHakuba(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 16)
    .replace(" ", "T");
}

type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "success"; data: T };

function loadable<T>(q: {
  isEnabled: boolean;
  isPending: boolean;
  isError: boolean;
  data: T | undefined;
}): Loadable<T> {
  if (!q.isEnabled) return { status: "idle" };
  if (q.isPending) return { status: "loading" };
  if (q.isError || q.data === undefined) return { status: "error" };
  return { status: "success", data: q.data };
}

export function MapShell() {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<PanelMode>("drive");
  const [origin, setOrigin] = useState<Coord | null>(null);
  // name of the searched place, if the origin came from search (not a dropped pin)
  const [originName, setOriginName] = useState<string | null>(null);
  // what the origin is, for saving it (a search result's id, else the pin's coordinate)
  const [originSource, setOriginSource] = useState<PlaceInput | null>(null);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [category, setCategory] = useState<DestinationCategory>("resorts");
  const [poiId, setPoiId] = useState<string | null>(null);
  // a free destination: a saved place's "Go here"
  const [point, setPoint] = useState<Coord | null>(null);
  // Saved panel: open, and optionally focused on one place (a tapped saved marker)
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedFocus, setSavedFocus] = useState<string | null>(null);
  // text the app puts in the search box when it sets the origin itself
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  // a shared list waiting for the user to confirm (`#import=…`)
  const [importCode, setImportCode] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [rankOptions, setRankOptions] = useState<RankOptions>(DEFAULT_RANK);
  const [departAt, setDepartAt] = useState("");
  const [showNight, setShowNight] = useState(false);
  const [busChoice, setBusChoice] = useState<BusOption | null>(null);
  useEffect(() => setDepartAt(nowInHakuba()), []); // client clock only, avoids SSR mismatch

  // Restore the shared view once, then mirror every change back into the URL.
  // `ready` is state (not a ref) so the first URL write happens on a render that
  // already holds the restored values; with a ref, StrictMode's double-mount
  // would overwrite the shared URL with defaults before it is read again.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const view = parseViewState(window.location.search);
    setMode(view.mode);
    setOrigin(view.origin);
    // No shared origin: start from My hotel, like Google starting from Home.
    const hotel = view.origin ? undefined : hotelOf(savedStore.getSnapshot());
    if (hotel) {
      setOrigin(hotel.coord);
      setOriginName(hotel.name);
      setOriginSource(hotel);
      setSearchLabel(`My hotel · ${hotel.name}`);
    }
    setPoint(view.point);
    setImportCode(readImportHash(window.location.hash));
    setSelectedResortId(view.resortId);
    setCategory(view.category);
    setPoiId(view.poiId);
    setRankOptions(view.rank);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const search = serializeViewState({
      origin,
      mode,
      resortId: selectedResortId,
      poiId,
      category,
      rank: rankOptions,
      point,
    });
    window.history.replaceState(null, "", search);
  }, [
    ready,
    origin,
    mode,
    selectedResortId,
    poiId,
    category,
    rankOptions,
    point,
  ]);

  // Choosing a resort or nearby place replaces a saved place's "Go here".
  const selectResort = (id: string) => {
    setSelectedResortId(id);
    setPoint(null);
  };
  const startFrom = (place: SavedPlace) => {
    setOrigin(place.coord);
    setOriginName(place.kind === "pin" ? null : place.name);
    setOriginSource(place);
    setSearchLabel(place.name);
    setFlyTo(place.coord);
    setSavedOpen(false);
  };
  const goTo = (place: SavedPlace) => {
    setPoint(place.coord);
    setSavedOpen(false);
  };

  const resorts = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });

  const showLodging = view !== null && view.zoom >= LODGING_MIN_ZOOM;
  const lodging = useQuery({
    queryKey: ["lodging", view?.bbox],
    queryFn: () => fetchLodging(view!.bbox),
    enabled: showLodging,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY, // snapshot data
  });
  const lodgingPins = showLodging ? (lodging.data ?? []) : [];

  const ranking = useQuery({
    queryKey: ["rank", origin, rankOptions],
    queryFn: () => fetchRank(origin!, rankOptions),
    enabled: mode === "drive" && origin !== null,
    retry: false,
    placeholderData: (previous) => previous, // keep the list while re-sorting
  });
  const rankingState: RankingState = ranking.isPending
    ? { status: "loading" }
    : ranking.isError
      ? { status: "error" }
      : { status: "success", data: ranking.data };

  const busEnabled = mode === "bus" && origin !== null && departAt !== "";
  const bus = useQuery({
    queryKey: ["bus", origin, departAt, originName],
    queryFn: () => fetchBusOptions(origin!, departAt, originName),
    enabled: busEnabled && !showNight,
    retry: false,
  });
  const night = useQuery({
    queryKey: ["night-bus", origin, departAt],
    queryFn: () => fetchNightBus(origin!, departAt),
    enabled: busEnabled && showNight,
    retry: false,
  });
  const busStop =
    mode === "bus" && !showNight ? (busChoice?.boardStopCoord ?? null) : null;

  // The bus ride, drawn along the roads between its located stops (approximate).
  const rideStops = useMemo(
    () => busChoice?.rideStops.flatMap((s) => (s.coord ? [s.coord] : [])) ?? [],
    [busChoice],
  );
  const ride = useQuery({
    queryKey: [
      "ride",
      busChoice?.routeId,
      busChoice?.trip,
      busChoice?.boardStopId,
      busChoice?.alightStopId,
    ],
    queryFn: () => fetchPath("drive", rideStops),
    enabled: busStop !== null && rideStops.length >= 2,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  // Memoised: MapView re-fits the map when this changes, so it must not be a new
  // object on every render (that re-fit after each pan looped under reduced motion).
  const rideLeg = useMemo(
    () =>
      busStop !== null && busChoice && ride.data
        ? {
            route: ride.data,
            stops: rideStops,
            label:
              busChoice.rideS != null ? formatDuration(busChoice.rideS) : null,
          }
        : null,
    [busStop, busChoice, ride.data, rideStops],
  );

  // Drive to the access point the ranking found nearest; otherwise the first one.
  const resort = resorts.data?.find((r) => r.id === selectedResortId);
  const nearestId = ranking.data?.find(
    (r) => r.resortId === selectedResortId,
  )?.accessPointId;
  const destination = (
    resort?.accessPoints.find((a) => a.id === nearestId) ??
    resort?.accessPoints[0]
  )?.coord;

  // In bus mode the route shown is the walk to the chosen boarding stop.
  const routeMode = mode === "bus" ? "walk" : mode;

  // Food / konbini destinations (drive and walk only; shuttles serve resorts).
  const poiCategory = category === "resorts" ? null : category;
  const pois = useQuery({
    queryKey: ["pois", origin, poiCategory, routeMode],
    queryFn: () => fetchNearbyPois(origin!, poiCategory!, routeMode),
    enabled: mode !== "bus" && origin !== null && poiCategory !== null,
    retry: false,
    placeholderData: (previous) => previous,
  });
  const poiState: PoiListState = pois.isPending
    ? { status: "loading" }
    : pois.isError
      ? { status: "error" }
      : { status: "success", data: pois.data };
  const selectedPoi = pois.data?.find((p) => p.id === poiId) ?? null;
  const poiTarget = poiCategory ? (selectedPoi?.coord ?? null) : null;

  const target =
    mode === "bus"
      ? busStop
      : (point ?? (poiCategory ? poiTarget : destination));
  const routeQuery = useQuery({
    queryKey: ["routes", routeMode, origin, target],
    queryFn: () => fetchRoutes(routeMode, origin!, target!),
    enabled: Boolean(origin && target),
    retry: false,
  });
  // Primary first, then alternates; the bus tab shows only the walk to the stop.
  const routes = useMemo<Route[]>(() => {
    const set = routeQuery.data;
    if (!set) return [];
    return mode === "bus" ? [set.primary] : [set.primary, ...set.alternates];
  }, [routeQuery.data, mode]);
  const [activeRoute, setActiveRoute] = useState(0);
  const [highlight, setHighlight] = useState<[number, number] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on every new route set
  useEffect(() => setActiveRoute(0), [routes]);

  const routeState: RouteState = !routeQuery.isEnabled
    ? { status: "idle" }
    : routeQuery.isPending
      ? { status: "loading" }
      : routeQuery.isError
        ? {
            status: "error",
            error:
              routeQuery.error instanceof ApiError
                ? routeQuery.error.code
                : "unknown",
          }
        : { status: "success", data: routes[activeRoute] ?? routes[0] };

  const routeData = routeState.status === "success" ? routeState.data : null;

  // Pilot (turn-by-turn): the route is frozen at Start; GPS (or a simulation) drives it.
  const [pilotRoute, setPilotRoute] = useState<Route | null>(null);
  const [pilotSource, setPilotSource] = useState<PositionSource | null>(null);
  const [following, setFollowing] = useState(true);
  // the destination stays fixed while reroutes replace the route
  const [pilotTarget, setPilotTarget] = useState<Coord | null>(null);
  const [reroutes, setReroutes] = useState(0);
  const pilot = usePilot(pilotRoute, pilotSource);
  const reroute = useReroute({
    phase: pilot.phase,
    fix: pilot.fix,
    mode: pilotRoute?.mode ?? "walk",
    target: pilotTarget,
    fetchRoute: async (m, from, to) => (await fetchRoutes(m, from, to)).primary,
    onNewRoute: (r) => {
      setPilotRoute(r);
      setReroutes((n) => n + 1);
    },
    // a fresh copy restarts matching on the old route, so the user can rejoin it
    onFailure: () => setPilotRoute((r) => (r ? { ...r } : r)),
  });
  const piloting = pilotRoute !== null;
  const startPilot = () => {
    const route = routes[activeRoute];
    if (!route) return;
    const simulate =
      process.env.NODE_ENV !== "production" &&
      new URLSearchParams(window.location.search).has("simulate");
    if (!muted) primeSpeech(); // inside the tap, or iOS won't speak later
    setPilotRoute(route);
    setPilotTarget(target ?? null);
    setReroutes(0);
    setFollowing(true);
    setPilotSource(
      simulate
        ? simulatedSource(
            route.geometry.coordinates as LngLat[],
            SIMULATED_MPS[route.mode],
          )
        : geolocationSource(),
    );
  };
  const exitPilot = () => {
    setPilotRoute(null);
    setPilotSource(null);
  };
  // Voice and vibration (SPEC-pilot): each threshold once per maneuver, per route.
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(loadMuted()), []); // browser storage: client only
  const said = useRef(new Set<string>());
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new (re)route starts fresh
  useEffect(() => {
    said.current = new Set();
  }, [pilotRoute]);
  const next = pilot.guidance?.next;
  const cueKey = next ? `${next.stepIndex}:${Math.round(next.distanceM)}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: cueKey stands for the next maneuver
  useEffect(() => {
    if (!pilotRoute || pilot.phase !== "following") return;
    const due = dueAnnouncement(pilot.guidance, pilotRoute.mode, said.current);
    if (!due) return;
    buzz();
    if (!muted) speak(due.text);
  }, [cueKey, pilot.phase]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (pilot.phase === "arrived" && !muted) speak("You've arrived.");
  }, [pilot.phase === "arrived"]);
  useWakeLock(piloting);
  useHiddenTimeout(piloting, PILOT_HIDDEN_STOP_MS, exitPilot);
  const projection = pilot.nav.projection;
  const onRoute = pilot.phase === "following" || pilot.phase === "arrived";
  const mapPilot = piloting
    ? {
        camera: pilot.camera,
        puck:
          onRoute && projection
            ? projection.point
            : pilot.fix
              ? ([pilot.fix.lng, pilot.fix.lat] as LngLat)
              : null,
        heading: pilot.camera?.bearing ?? null,
        covered:
          projection && pilot.route
            ? splitAt(pilot.route.coords, projection).covered
            : [],
        following,
        onUserMove: () => setFollowing(false),
      }
    : null;
  const routeLayers = [
    ...routes.map((_, i) =>
      mode === "bus" ? "walk" : i === activeRoute ? "primary" : "alternate",
    ),
    ...(rideLeg ? ["ride"] : []),
  ].join(",");

  const savedState = useSaved();
  const savedMarkers = useMemo(() => visibleMarkers(savedState), [savedState]);
  const fromPlace: PlaceInput | null = origin
    ? (originSource ??
      placeAt(savedState, origin) ?? {
        id: pinId(origin),
        name: "Dropped pin",
        coord: origin,
        kind: "pin",
      })
    : null;
  const pointPlace: PlaceInput | null = point
    ? (placeAt(savedState, point) ?? {
        id: pinId(point),
        name: "Chosen place",
        coord: point,
        kind: "pin",
      })
    : null;
  const toPlace: PlaceInput | null =
    mode !== "bus" && pointPlace
      ? pointPlace
      : mode === "bus"
        ? busChoice?.boardStopCoord
          ? {
              id: busChoice.boardStopId,
              name: busChoice.boardStopName,
              coord: busChoice.boardStopCoord,
              kind: "stop",
            }
          : null
        : poiCategory
          ? selectedPoi
            ? {
                id: selectedPoi.id,
                name: selectedPoi.name,
                coord: selectedPoi.coord,
                kind: "poi",
              }
            : null
          : resort && destination
            ? {
                id: resort.id,
                name: resort.name.en,
                coord: destination,
                kind: "resort",
              }
            : null;

  return (
    <main
      className="fixed inset-0"
      data-map-loaded={loaded}
      data-route-points={routeData?.geometry.coordinates.length ?? 0}
      data-route-layers={routeLayers}
      data-lodging-pins={lodgingPins.length}
      data-piloting={piloting}
    >
      <MapView
        resorts={resorts.data ?? []}
        selectedResortId={selectedResortId}
        origin={origin}
        destination={mode === "bus" ? null : (target ?? null)}
        routes={pilotRoute ? [pilotRoute] : routes}
        activeRoute={pilotRoute ? 0 : activeRoute}
        onSelectRoute={setActiveRoute}
        highlight={pilotRoute ? null : highlight}
        ride={pilotRoute ? null : rideLeg}
        pilot={mapPilot}
        lodging={lodgingPins}
        busStop={busStop}
        flyTo={flyTo}
        onLoad={() => setLoaded(true)}
        onViewChange={setView}
        onPickOrigin={(coord) => {
          setOrigin(coord);
          setOriginName(null);
          setOriginSource(null);
        }}
        onSelectResort={selectResort}
        saved={savedMarkers}
        onSelectSaved={(id) => {
          setSavedFocus(id);
          setSavedOpen(true);
        }}
      />
      {pilotRoute && (
        <PilotView
          status={pilot}
          mode={pilotRoute.mode}
          following={following}
          reroute={reroute}
          reroutes={reroutes}
          muted={muted}
          onToggleMute={() => {
            saveMuted(!muted);
            setMuted(!muted);
          }}
          onExit={exitPilot}
          onRecenter={() => setFollowing(true)}
          now={new Date()}
        />
      )}
      {!pilotRoute && (
        <BottomSheet
          label="Directions"
          header={
            <div className="flex flex-col gap-2">
              <SearchBox
                label={searchLabel}
                onSelect={(place) => {
                  setOrigin(place.coord);
                  setOriginName(place.name);
                  setOriginSource({
                    id: place.id,
                    name: place.name,
                    coord: place.coord,
                    kind: kindFromSuggestion(place.kind),
                  });
                  setFlyTo(place.coord);
                }}
                onClear={() => {
                  setOrigin(null);
                  setOriginName(null);
                  setOriginSource(null);
                  setSearchLabel(null);
                  setBusChoice(null);
                }}
                near={
                  view
                    ? {
                        lat: (view.bbox.south + view.bbox.north) / 2,
                        lng: (view.bbox.west + view.bbox.east) / 2,
                      }
                    : null
                }
              />
              <button
                type="button"
                aria-label="Saved places"
                aria-pressed={savedOpen}
                className="self-start rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-sm hover:bg-muted aria-pressed:bg-amber-50"
                onClick={() => {
                  setSavedFocus(null);
                  setSavedOpen((v) => !v);
                }}
              >
                <span aria-hidden="true" className="text-amber-500">
                  ★
                </span>{" "}
                Saved
              </button>
            </div>
          }
        >
          {savedOpen ? (
            <SavedPanel
              focusId={savedFocus}
              canGoHere={mode !== "bus"}
              onStartFrom={startFrom}
              onGoHere={goTo}
              onClose={() => setSavedOpen(false)}
            />
          ) : (
            <ModePanel
              mode={mode}
              onModeChange={setMode}
              resorts={resorts.data ?? []}
              selectedResortId={selectedResortId}
              onSelectResort={selectResort}
              hasOrigin={origin !== null}
              placeStrip={<PlaceStrip from={fromPlace} to={toPlace} />}
              onStart={mode === "bus" ? undefined : startPilot}
              route={routeState}
              routes={routes}
              activeRoute={activeRoute}
              onSelectRoute={setActiveRoute}
              onHighlightStep={setHighlight}
              departAt={departAt ? new Date(`${departAt}:00+09:00`) : undefined}
              busPanel={
                <BusPanel
                  resorts={resorts.data ?? []}
                  result={loadable(bus)}
                  night={loadable(night)}
                  showNight={showNight}
                  onShowNightChange={setShowNight}
                  departAt={departAt}
                  onDepartAtChange={setDepartAt}
                  selected={busChoice}
                  onSelect={setBusChoice}
                />
              }
              destinationPicker={
                <DestinationPicker
                  value={category}
                  onChange={(c) => {
                    setCategory(c);
                    setPoint(null);
                  }}
                />
              }
              poiPanel={
                poiCategory ? (
                  <PoiList
                    state={poiState}
                    selectedId={poiId}
                    onSelect={(p) => {
                      setPoiId(p.id);
                      setPoint(null);
                    }}
                  />
                ) : undefined
              }
              drivePanel={
                <DrivePanel
                  options={rankOptions}
                  onOptionsChange={setRankOptions}
                  ranking={rankingState}
                  selectedResortId={selectedResortId}
                  onSelectResort={selectResort}
                />
              }
            />
          )}
        </BottomSheet>
      )}
      {importCode && (
        <ImportDialog
          code={importCode}
          onDone={(imported) => {
            // the URL mirror above already dropped the fragment, so a reload won't ask again
            setImportCode(null);
            if (imported) setSavedOpen(true);
          }}
        />
      )}
    </main>
  );
}
