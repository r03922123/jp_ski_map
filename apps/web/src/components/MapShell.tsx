"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { BusPilotView } from "@/components/BusPilotView";
import { DestinationPicker } from "@/components/DestinationPicker";
import { DrivePanel, type RankingState } from "@/components/DrivePanel";
import { heroPose } from "@/components/HeroMarker";
import { ImportDialog } from "@/components/ImportDialog";
import {
  ModePanel,
  type PanelMode,
  type RouteState,
} from "@/components/ModePanel";
import { PilotView } from "@/components/PilotView";
import { PinCard } from "@/components/PinCard";
import { PoiList, type PoiListState } from "@/components/PoiList";
import { QuestLog } from "@/components/QuestLog";
import {
  MyRiderCard,
  RiderButton,
  SharedRiderCard,
} from "@/components/RiderCard";
import { SavedPanel } from "@/components/SavedPanel";
import { SearchBox } from "@/components/SearchBox";
import { SoundToggle } from "@/components/SoundToggle";
import { StampMoment } from "@/components/StampMoment";
import { TitleScreen } from "@/components/TitleScreen";
import {
  DestinationBox,
  TripPanel,
  type TripStop,
} from "@/components/TripPanel";
import {
  ApiError,
  type Bbox,
  type BusOption,
  type Coord,
  fetchBusOptions,
  fetchBusToPlace,
  fetchLodging,
  fetchNearbyPois,
  fetchNightBus,
  fetchPath,
  fetchRank,
  fetchRoutes,
  type Route,
  resortsQuery,
  type Suggestion,
} from "@/lib/api";
import { mirrorUrl } from "@/lib/back-close";
import { nowInHakuba } from "@/lib/depart-at";
import { simulateRequested, usePilotAvailable } from "@/lib/device";
import { formatArrival, formatDuration } from "@/lib/format";
import { completeKonbini, isKonbini } from "@/lib/game/quests";
import { riderStore } from "@/lib/game/rider";
import { readRiderHash } from "@/lib/game/rider-share";
import { sfx } from "@/lib/game/sfx";
import { earnVisit } from "@/lib/game/stamp-moment";
import { arrivedAt, jstDate } from "@/lib/game/stamps";
import { addTrip, coveredKm, journeyArrived, tripKm } from "@/lib/game/stats";
import { worldNumbers } from "@/lib/game/worlds";
import {
  alightIndexOf,
  type BusPlan,
  type BusState,
  boardManually,
  initialBus,
  planBus,
  reduceBus,
} from "@/lib/nav/bus-journey";
import { busChoiceFor, stopMatchName } from "@/lib/nav/bus-place";
import { cameraFor } from "@/lib/nav/camera";
import {
  geolocationSource,
  type PositionSource,
  simulatedSource,
} from "@/lib/nav/position";
import { projectForward, splitAt } from "@/lib/nav/project";
import { isFarFromRoute, useRouteProximity } from "@/lib/nav/proximity";
import { type NumberedStop, numberStops, stopsAhead } from "@/lib/nav/stops";
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
  MAX_STOPS,
  parseViewState,
  type RankOptions,
  serializeViewState,
} from "@/lib/url-state";
import { useNow } from "@/lib/use-now";
import { useHiddenTimeout, useWakeLock } from "@/lib/wake-lock";

/** Stop navigating after the page has been hidden this long (SPEC-pilot boundaries). */
const PILOT_HIDDEN_STOP_MS = 10 * 60_000;
const FAR_FROM_STOP =
  "Bus guidance works near the start. You're far from it right now.";
/** Preview, and `?simulate` in dev builds: replay the route at these speeds. */
const SIMULATED_MPS = { drive: 15, walk: 5 } as const;

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

const LODGING_MIN_ZOOM = 14;

/** Current Hakuba time as "YYYY-MM-DDTHH:mm" for the datetime-local input. */
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
  // a free destination (a saved place's or a pin's "Go here", a To-box place), with its
  // name when it has one; the link holds only the coordinate (names in the URL: cluster E)
  const [point, setPoint] = useState<{
    coord: Coord;
    name: string | null;
  } | null>(null);
  // stops between start and destination; an empty one is waiting for typing or a map tap
  const [stops, setStops] = useState<TripStop[]>([]);
  // A long-pressed point (or tapped hotel pin) and its card: touch edits the trip only
  // through the card's buttons (docs/ux/behaviour-cards.md BC-A1)
  const [droppedPin, setDroppedPin] = useState<{
    coord: Coord;
    name: string | null;
  } | null>(null);
  const stopKeys = useRef(0);
  const [searchKey, setSearchKey] = useState(0);
  const newStopKey = () => {
    stopKeys.current += 1;
    return `stop-${stopKeys.current}`;
  };
  const filledStops = stops.flatMap((st) => (st.place ? [st.place] : []));
  const stopsKey = filledStops
    .map((st) => `${st.coord.lat},${st.coord.lng}`)
    .join(";");
  const fillStop = (key: string, place: PlaceInput) =>
    setStops((list) =>
      list.map((st) => (st.key === key ? { ...st, place } : st)),
    );
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
  const [storedBusChoice, setBusChoice] = useState<BusOption | null>(null);
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
    setPoint(view.point ? { coord: view.point, name: null } : null);
    setStops(
      view.stops.map((coord, i) => ({
        key: `stop-url-${i}`,
        place: { id: pinId(coord), name: "Dropped pin", coord, kind: "pin" },
      })),
    );
    setImportCode(readImportHash(window.location.hash));
    setRiderCode(readRiderHash(window.location.hash));
    setSelectedResortId(view.resortId);
    setCategory(view.category);
    setPoiId(view.poiId);
    setRankOptions(view.rank);
    setReady(true);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: stopsKey stands for the stops' content
  useEffect(() => {
    if (!ready) return;
    const search = serializeViewState({
      origin,
      mode,
      resortId: selectedResortId,
      poiId,
      category,
      rank: rankOptions,
      point: point?.coord ?? null,
      stops: filledStops.map((s) => s.coord),
    });
    mirrorUrl(search);
  }, [
    ready,
    origin,
    mode,
    selectedResortId,
    poiId,
    category,
    rankOptions,
    point,
    stopsKey,
  ]);

  // Choosing a resort or nearby place replaces a saved place's "Go here".
  const selectResort = (id: string) => {
    sfx().play("select");
    // the To box and the Bus list follow the resort, so a bus to another one can't stay
    if (storedBusChoice?.resortId !== id) setBusChoice(null);
    setSelectedResortId(id);
    setPoint(null);
  };
  // The To box (SPEC-web-app v1.8, BC-T1): a pick there changes only the destination. A
  // resort selects it as the list does (the resorts tab, or a food tab would win); any
  // other place is a free destination with its name.
  const chooseTo = (place: Suggestion) => {
    setBusChoice(null); // it was chosen for the old destination (v1.13 rule 5)
    if (
      place.kind === "resort" &&
      resorts.data?.some((r) => r.id === place.id)
    ) {
      setCategory("resorts");
      setPoiId(null);
      selectResort(place.id);
    } else {
      // the place replaces whatever was chosen: no resort card or food row stays pressed,
      // and the link holds only the point (the same gap in Go here is D5, cluster J)
      sfx().play("select");
      setSelectedResortId(null);
      setPoiId(null);
      setPoint({ coord: place.coord, name: place.name });
    }
  };
  const clearTo = () => {
    setBusChoice(null);
    setSelectedResortId(null);
    setPoiId(null);
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
    setPoint({ coord: place.coord, name: place.name });
    setSavedOpen(false);
  };

  const resorts = useQuery(resortsQuery);

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

  const savedState = useSaved();
  const pointPlace: PlaceInput | null = point
    ? (placeAt(savedState, point.coord) ?? {
        id: pinId(point.coord),
        name: point.name ?? "Chosen place",
        coord: point.coord,
        kind: "pin",
      })
    : null;
  // Bus mode with a destination that isn't a resort: the way back (SPEC-web-app v1.11)
  const busPlace =
    mode === "bus" && pointPlace?.kind !== "resort" ? pointPlace : null;
  const busChoice = busChoiceFor(storedBusChoice, busPlace !== null);
  const busPlaceName = stopMatchName(busPlace?.name);
  const busEnabled = mode === "bus" && origin !== null && departAt !== "";
  const bus = useQuery({
    queryKey: ["bus", origin, departAt, originName],
    queryFn: () => fetchBusOptions(origin!, departAt, originName),
    enabled: busEnabled && !showNight && busPlace === null,
    retry: false,
  });
  const busToPlace = useQuery({
    queryKey: [
      "bus-to-place",
      origin,
      busPlace?.coord,
      departAt,
      originName,
      busPlaceName,
    ],
    queryFn: () =>
      fetchBusToPlace(
        origin!,
        busPlace!.coord,
        departAt,
        originName,
        busPlaceName,
      ),
    enabled: busEnabled && !showNight && busPlace !== null,
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
  // To the stop where you get off (as the journey list), with names for the map.
  const rideStopMarks = useMemo(
    () =>
      busChoice
        ? busChoice.rideStops
            .slice(0, alightIndexOf(busChoice) + 1)
            .flatMap((s) => (s.coord ? [{ coord: s.coord, name: s.name }] : []))
        : [],
    [busChoice],
  );
  const rideStops = useMemo(
    () => rideStopMarks.map((m) => m.coord),
    [rideStopMarks],
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
            stops: rideStopMarks,
            label:
              busChoice.rideS != null ? formatDuration(busChoice.rideS) : null,
          }
        : null,
    [busStop, busChoice, ride.data, rideStopMarks],
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
      : (point?.coord ?? (poiCategory ? poiTarget : destination));
  // With stops (drive/walk) the route is one trip through them; no alternates then.
  const viaStops = mode === "bus" ? [] : filledStops.map((s) => s.coord);
  const routeQuery = useQuery({
    queryKey: ["routes", routeMode, origin, target, viaStops],
    queryFn: async () => {
      if (!origin || !target)
        throw new Error("route query ran without both ends");
      return viaStops.length > 0
        ? {
            primary: await fetchPath(routeMode, [origin, ...viaStops, target], {
              stopAtPoints: true,
            }),
            alternates: [],
          }
        : fetchRoutes(routeMode, origin, target);
    },
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
  const tripCounted = useRef(false);
  // SPEC-progression: only a trip on real GPS earns stamps or counts (never a preview or
  // ?simulate); captured at Start, so later planner edits can't change what was ridden
  const realTrip = useRef(false);
  const konbiniTrip = useRef(false);
  /** the bus journey started at the stop: its "walk" leg is the bus line itself */
  const walkIsLine = useRef(false);
  // SPEC-progression: your rider card, or someone's from a #rider= link
  const [riderOpen, setRiderOpen] = useState(false);
  const [riderCode, setRiderCode] = useState<string | null>(null);
  const [pilotSource, setPilotSource] = useState<PositionSource | null>(null);
  const [following, setFollowing] = useState(true);
  // the destination stays fixed while reroutes replace the route
  const [pilotTarget, setPilotTarget] = useState<Coord | null>(null);
  // the trip's stops for this session, so a reroute still visits the ones ahead
  const [pilotStops, setPilotStops] = useState<NumberedStop[]>([]);
  const [reroutes, setReroutes] = useState(0);
  // Bus pilot: the walk leg uses the turn-by-turn pilot; then wait → ride → arrived.
  const [busPlan, setBusPlan] = useState<BusPlan | null>(null);
  const [busState, setBusState] = useState<BusState>(initialBus);
  const busPhase = busPlan ? busState.phase : null;
  const pastWalk = busPhase !== null && busPhase !== "walk";
  // Preview: the route plays instead of GPS (the phone is far from it; SPEC-pilot)
  const [preview, setPreview] = useState<null | "chosen" | "switched">(null);
  const [busNote, setBusNote] = useState<string | null>(null);
  const firstFixChecked = useRef(false);
  const pilot = usePilot(pilotRoute, pilotSource);
  const reroute = useReroute({
    // at the stop the walk route is done, and a preview has no position: never reroute
    phase: pastWalk || preview ? "following" : pilot.phase,
    fix: pilot.fix,
    mode: pilotRoute?.mode ?? "walk",
    target: pilotTarget,
    fetchRoute: async (m, from, to) => {
      const ahead = pilot.route
        ? stopsAhead(pilot.route, pilot.nav.lastGood?.alongM ?? 0, pilotStops)
        : pilotStops;
      const route =
        ahead.length > 0
          ? numberStops(
              await fetchPath(m, [from, ...ahead.map((s) => s.coord), to], {
                stopAtPoints: true,
              }),
              ahead.map((s) => s.n),
            )
          : (await fetchRoutes(m, from, to)).primary;
      // only now: a failed reroute keeps the old route, whose stops are all still listed
      setPilotStops(ahead);
      return route;
    },
    onNewRoute: (r) => {
      setPilotRoute(r);
      setReroutes((n) => n + 1);
    },
    // a fresh copy restarts matching on the old route, so the user can rejoin it
    onFailure: () => setPilotRoute((r) => (r ? { ...r } : r)),
  });
  const piloting = pilotRoute !== null;
  // Start is offered on touch-first devices only (SPEC-pilot "Devices")
  const pilotAvailable = usePilotAvailable();
  // is the phone near where this route starts? (read only if location is already allowed)
  const routeStart =
    (routes[activeRoute]?.geometry.coordinates[0] as LngLat | undefined) ??
    null;
  const proximity = useRouteProximity(routeStart, pilotAvailable && !piloting);
  const beginPilot = (
    route: Route,
    goal: Coord | null,
    {
      asPreview = false,
      stops: viaStopsForPilot = [],
    }: { asPreview?: boolean; stops?: NumberedStop[] } = {},
  ) => {
    const simulate =
      process.env.NODE_ENV !== "production" && simulateRequested();
    sfx().play("confirm");
    tripCounted.current = false; // a new trip for the rider's stats
    realTrip.current = !asPreview && !simulate;
    konbiniTrip.current =
      mode !== "bus" &&
      ((point === null &&
        poiCategory === "convenience" &&
        selectedPoi !== null) ||
        filledStops.some((st) => isKonbini(st.name)));
    firstFixChecked.current = false;
    setPreview(asPreview ? "chosen" : null);
    setBusNote(null);
    setPilotRoute(route);
    setPilotTarget(goal);
    setPilotStops(viaStopsForPilot);
    setReroutes(0);
    setFollowing(true);
    setPilotSource(
      simulate || asPreview
        ? simulatedSource(
            route.geometry.coordinates as LngLat[],
            SIMULATED_MPS[route.mode],
          )
        : geolocationSource(),
    );
  };
  const startPilot = () => {
    const route = routes[activeRoute];
    if (route)
      beginPilot(route, target ?? null, {
        asPreview: proximity === "far",
        stops: viaStops.map((coord, i) => ({ n: i + 1, coord })),
      });
  };
  const startBusPilot = () => {
    if (!busChoice) return;
    if (proximity === "far") {
      setBusNote(FAR_FROM_STOP);
      return;
    }
    const plan = planBus(busChoice, ride.data ?? null);
    setBusPlan(plan);
    setBusState(initialBus());
    // the walk to the boarding stop; already there → the bus line stands in
    walkIsLine.current = !routes[0];
    beginPilot(routes[0] ?? plan.line.route, busChoice.boardStopCoord);
  };
  const exitPilot = () => {
    if (
      pilotRoute &&
      realTrip.current &&
      !preview &&
      !tripCounted.current &&
      pilot.route
    ) {
      tripCounted.current = true;
      const along = pilot.nav.lastGood?.alongM ?? 0;
      const km =
        busPlan && busPhase === "ride"
          ? { bus: coveredKm(busState.alongM, busPlan.line.totalM) }
          : {
              [busPlan || mode === "walk" ? "walk" : "drive"]:
                busPlan && walkIsLine.current
                  ? 0
                  : coveredKm(along, pilot.route.totalM),
            };
      riderStore.update((s) => addTrip(s, km, false));
    }
    setPilotRoute(null);
    setPilotSource(null);
    setBusPlan(null);
    setPreview(null);
  };
  // Tapped Start without knowing where the phone is: the first fix decides.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per session, on its first fix
  useEffect(() => {
    const fix = pilot.fix;
    const route = pilotRoute;
    if (!fix || !route || preview || firstFixChecked.current) return;
    firstFixChecked.current = true;
    const start = route.geometry.coordinates[0] as LngLat;
    if (!isFarFromRoute(fix, start)) return;
    if (busPlan) {
      exitPilot(); // a bus journey depends on the real place and time: no preview
      setBusNote(FAR_FROM_STOP);
      return;
    }
    setPreview("switched");
    setPilotSource(
      simulatedSource(
        route.geometry.coordinates as LngLat[],
        SIMULATED_MPS[route.mode],
      ),
    );
  }, [pilot.fix]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: advance on each new fix
  useEffect(() => {
    const fix = pilot.fix;
    if (!busPlan || !fix) return;
    setBusState((s) =>
      reduceBus(s, busPlan, fix, Date.now(), pilot.phase === "arrived"),
    );
  }, [pilot.fix, busPlan]);
  const now = useNow(busPhase === "wait" ? 15_000 : null);
  // SPEC-progression: a trip that ends at a resort's base earns its stamp (the
  // position is compared and dropped; only the resort and the day are kept)
  // a bus journey arrives with the bus (its pilot route is only the walk to the stop)
  const tripArrived = journeyArrived(busPhase, pilot.phase);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (!tripArrived || preview || !realTrip.current) return;
    if (pilot.fix && resorts.data) {
      const at = arrivedAt(resorts.data, pilot.fix);
      if (at) earnVisit(at, worldNumbers(resorts.data).get(at.id) ?? 0);
    }
    if (tripCounted.current) return;
    tripCounted.current = true;
    // stats: a navigated trip that arrived; a konbini on the way finishes that quest
    const km = tripKm({
      mode: busPlan ? "bus" : mode === "walk" ? "walk" : "drive",
      routeM: pilot.route?.totalM ?? 0,
      bus: busPlan
        ? {
            alongM: busState.alongM,
            lineM: busPlan.line.totalM,
            walkIsLine: walkIsLine.current,
          }
        : undefined,
    });
    riderStore.update((s) => {
      const next = addTrip(s, km, true);
      return konbiniTrip.current
        ? completeKonbini(next, jstDate(new Date()))
        : next;
    });
  }, [tripArrived]);
  // SPEC-game-theme: the bus has come (boarding), and leaving the route
  useEffect(() => {
    if (busPhase === "ride") sfx().play("bus");
  }, [busPhase]);
  // only where the off-route banner shows (not on the bus, not in a preview)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the phase change is the cue
  useEffect(() => {
    if (pilot.phase === "offRoute" && !pastWalk && !preview)
      sfx().play("offRoute");
  }, [pilot.phase]);
  useWakeLock(piloting);
  useHiddenTimeout(piloting, PILOT_HIDDEN_STOP_MS, exitPilot);
  // During a bus journey the map shows the bus line and every stop, in every phase.
  const busRide = useMemo(
    () =>
      busPlan
        ? {
            route: busPlan.line.route,
            stops: busPlan.stops
              .slice(0, busPlan.alightIndex + 1)
              .flatMap((st) =>
                st.coord
                  ? [
                      {
                        coord: { lat: st.coord[1], lng: st.coord[0] },
                        name: st.name,
                      },
                    ]
                  : [],
              ),
            label: null,
          }
        : null,
    [busPlan],
  );
  // the one bus line the map draws (the journey's, or the chosen option's preview)
  const mapRide = busRide ?? (pilotRoute ? null : rideLeg);
  const projection = pilot.nav.projection;
  const onRoute = pilot.phase === "following" || pilot.phase === "arrived";
  const rideFix = busPhase === "ride" ? pilot.fix : null;
  const rideAt =
    busPlan && rideFix
      ? projectForward(busPlan.line, rideFix, busState.rideIndex, 80, 5000)
      : null;
  const rideCamera =
    busPlan && rideAt && rideFix
      ? cameraFor(busPlan.line, rideAt, rideFix)
      : null;
  // SPEC-game-theme: the rider's pose follows the trip
  const pose = heroPose({
    mode: busPlan ? "bus" : mode === "walk" ? "walk" : "drive",
    phase: pilot.phase,
    bus: busPhase ?? undefined,
  });
  const mapPilotBase =
    busPlan && rideAt && rideCamera
      ? {
          camera: rideCamera,
          puck: rideAt.point,
          heading: rideCamera.bearing,
          covered: splitAt(busPlan.line.coords, rideAt).covered,
          following,
          onUserMove: () => setFollowing(false),
        }
      : pastWalk && busPlan
        ? {
            camera: null, // waiting at the stop, or arrived: the view is the user's
            puck: pilot.fix ? ([pilot.fix.lng, pilot.fix.lat] as LngLat) : null,
            heading: null,
            // arrived: the whole ride reads as done
            covered: busPhase === "arrived" ? busPlan.line.coords : [],
            following,
            onUserMove: () => setFollowing(false),
          }
        : piloting
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
  const mapPilot = mapPilotBase ? { ...mapPilotBase, pose } : null;
  const routeLayers = [
    ...routes.map((_, i) =>
      mode === "bus" ? "walk" : i === activeRoute ? "primary" : "alternate",
    ),
    ...(rideLeg ? ["ride"] : []),
  ].join(",");

  const viewCentre = view
    ? {
        lat: (view.bbox.south + view.bbox.north) / 2,
        lng: (view.bbox.west + view.bbox.east) / 2,
      }
    : null;
  // Map-tapped and linked stops are pins: name them as the start is named (a saved
  // place's name, else "Dropped pin") when drawn, so renumbering never strands a "Stop 2".
  const tripStops = stops.map((st) =>
    st.place?.kind === "pin"
      ? { ...st, place: placeAt(savedState, st.place.coord) ?? st.place }
      : st,
  );
  const clearOrigin = () => {
    setOrigin(null);
    setOriginName(null);
    setOriginSource(null);
    setSearchLabel(null);
    setBusChoice(null);
    // an empty stop box would take the next tap, which is meant for the new start
    setStops((list) => list.filter((st) => st.place !== null));
  };
  // An open stop box takes map taps only while it is on screen (SPEC-web-app v1.4).
  const placingStop =
    mode !== "bus" &&
    origin !== null &&
    !piloting &&
    !savedOpen &&
    stops.some((st) => st.place === null);
  // With both ends set only the trip's resort keeps its label (SPEC-web-app v1.12). An
  // open stop box is choosing again, and a resort can be tapped as the stop.
  const tripSet =
    origin !== null &&
    (mode === "bus"
      ? busPlace !== null || (busChoice !== null && !showNight)
      : Boolean(target));
  // a saved resort comes back as a point, but it is still that resort
  const pointResortId =
    pointPlace?.kind === "resort" &&
    resorts.data?.some((r) => r.id === pointPlace.id)
      ? pointPlace.id
      : null;
  const tripResortId =
    mode === "bus"
      ? (busChoice?.resortId ?? null)
      : point
        ? pointResortId
        : poiCategory
          ? null
          : selectedResortId;
  const shownResortIds =
    tripSet && !placingStop ? (tripResortId ? [tripResortId] : []) : undefined;
  const fillOpenStop = (place: PlaceInput) => {
    const open = stops.find((st) => st.place === null);
    if (open) fillStop(open.key, place);
  };
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
  // Bus's destination is the lodging or place, else the chosen bus's resort, where it
  // drops you, else the selected resort (SPEC-web-app v1.13 rule 5)
  const destinationResortId = pointResortId ?? selectedResortId;
  const busResort = resorts.data?.find(
    (r) => r.id === (busChoice?.resortId ?? destinationResortId),
  );
  const busResortAt = busChoice
    ? busChoice.rideStops[alightIndexOf(busChoice)]?.coord
    : destination;
  const busResortPlace: PlaceInput | null = busResort
    ? {
        id: busResort.id,
        name: busResort.name.en,
        coord: busResortAt ?? busResort.accessPoints[0].coord,
        kind: "resort",
      }
    : null;
  const toPlace: PlaceInput | null =
    mode === "bus"
      ? (busPlace ?? busResortPlace)
      : pointPlace
        ? pointPlace
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
  // the To box in the trip card, once there is a start or a destination
  const showToBox = origin !== null || toPlace !== null;
  // a new destination collapses the sheet so its route shows (v1.9 rule 4, cluster F)
  // bus: the chosen option is the answer too (code review: choosing one from a swiped-up
  // sheet left it at 80 % over the walk leg and the board stop)
  const busKey =
    mode === "bus" && busChoice
      ? `${busChoice.routeId}/${busChoice.trip}/${busChoice.boardStopId}`
      : "";
  const destinationKey = `${selectedResortId}|${poiId}|${point ? `${point.coord.lat},${point.coord.lng}` : ""}|${busKey}`;
  // with both ends set, anything that changes the route on screen reveals it too: a new
  // start, mode or stop, or another route option, tapped from a swiped-up sheet
  const routeKey =
    origin && target
      ? `${routeMode}|${origin.lat},${origin.lng}|${target.lat},${target.lng}|${stopsKey}|${activeRoute}`
      : "";

  const canAddStop =
    mode !== "bus" &&
    fromPlace !== null &&
    toPlace !== null &&
    stops.length < MAX_STOPS &&
    stops.every((s) => s.place !== null);
  // Back to the lodging in one tap (SPEC-web-app v1.10)
  const canSwap = fromPlace !== null && toPlace !== null;
  const swapTrip = () => {
    if (!fromPlace || !toPlace) return;
    sfx().play("select");
    setOrigin(toPlace.coord);
    setOriginName(stopMatchName(toPlace.name));
    setOriginSource(toPlace);
    setSearchLabel(toPlace.name);
    // remounted: a label equal to the last one the app set wouldn't replace a typed start
    setSearchKey((k) => k + 1);
    setPoiId(null);
    setBusChoice(null); // its stop was picked for the old start
    // a resort goes back to being selected, so a second tap restores the trip
    if (
      fromPlace.kind === "resort" &&
      resorts.data?.some((r) => r.id === fromPlace.id)
    ) {
      setCategory("resorts");
      setSelectedResortId(fromPlace.id);
      setPoint(null);
    } else {
      setSelectedResortId(null);
      setPoint({ coord: fromPlace.coord, name: fromPlace.name });
    }
    setStops((list) => [...list].reverse());
  };
  const pinPlace = (pin: {
    coord: Coord;
    name: string | null;
  }): PlaceInput => ({
    id: pinId(pin.coord),
    name: pin.name ?? "Dropped pin",
    coord: pin.coord,
    kind: "pin",
  });
  const pinCard = droppedPin && (
    <PinCard
      name={droppedPin.name}
      onClose={() => setDroppedPin(null)}
      onStart={() => {
        setOrigin(droppedPin.coord);
        setOriginName(droppedPin.name);
        setOriginSource(droppedPin.name ? pinPlace(droppedPin) : null);
        // the box shows the new start, as Google's From box does ("Dropped pin" when it
        // has no name); a fresh box, so it replaces whatever was typed before (S1)
        setSearchLabel(droppedPin.name ?? "Dropped pin");
        setSearchKey((k) => k + 1);
        setDroppedPin(null);
      }}
      onGo={
        // Bus has no "go here": its destination comes from the swap or another tab
        mode === "bus"
          ? undefined
          : () => {
              setPoint({ coord: droppedPin.coord, name: droppedPin.name });
              setDroppedPin(null);
            }
      }
      onAddStop={
        canAddStop
          ? () => {
              setStops((list) => [
                ...list,
                { key: newStopKey(), place: pinPlace(droppedPin) },
              ]);
              setDroppedPin(null);
            }
          : undefined
      }
    />
  );

  return (
    <main
      className="fixed inset-0"
      aria-labelledby="app-title"
      data-map-loaded={loaded}
      data-route-points={routeData?.geometry.coordinates.length ?? 0}
      data-route-layers={routeLayers}
      data-lodging-pins={lodgingPins.length}
      data-piloting={piloting}
      data-map-ride-stops={mapRide?.stops.length ?? 0}
    >
      <h1 id="app-title" className="sr-only">
        Hakuba Valley trip planner
      </h1>
      {busPlan && pastWalk && (
        <BusPilotView
          plan={busPlan}
          state={busState}
          now={now}
          basis={
            (busPlace ? busToPlace.data : bus.data)?.basis === "expected"
              ? "expected"
              : "published"
          }
          onBoard={() => setBusState(boardManually)}
          onExit={exitPilot}
        />
      )}
      {pilotRoute && !pastWalk && (
        <PilotView
          status={pilot}
          mode={pilotRoute.mode}
          following={following}
          reroute={reroute}
          reroutes={reroutes}
          footnote={
            busPlan
              ? `Then ${busPlan.option.routeName} from ${busPlan.stops[0].name} at ${formatArrival(new Date(busPlan.departsAtMs), 0)}`
              : undefined
          }
          busStops={
            busPlan
              ? busPlan.stops.slice(0, busPlan.alightIndex + 1)
              : undefined
          }
          onExit={exitPilot}
          onRecenter={() => setFollowing(true)}
          now={new Date()}
          preview={preview}
        />
      )}
      {!pilotRoute && (
        <BottomSheet
          label="Directions"
          header={
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <SearchBox
                    // remounted (emptied) when the trip panel's ✕ clears the start
                    key={searchKey}
                    // the swap button narrows this box once there is a start (T78)
                    placeholder={fromPlace ? "Search a start" : undefined}
                    // the top card reads From → To (BC-L1): never blank while there is a start
                    label={searchLabel ?? fromPlace?.name ?? null}
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
                    onClear={clearOrigin}
                    near={
                      view
                        ? {
                            lat: (view.bbox.south + view.bbox.north) / 2,
                            lng: (view.bbox.west + view.bbox.east) / 2,
                          }
                        : null
                    }
                  />
                </div>
                {fromPlace && (
                  <button
                    type="button"
                    aria-label="Swap start and destination"
                    disabled={!canSwap}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted disabled:opacity-40"
                    onClick={swapTrip}
                  >
                    <ArrowUpDown aria-hidden="true" className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Saved places"
                  aria-pressed={savedOpen}
                  className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border bg-background px-3 text-xs font-medium shadow-sm hover:bg-muted aria-pressed:bg-amber-50"
                  onClick={() => {
                    setSavedFocus(null);
                    setSavedOpen((v) => !v);
                  }}
                >
                  <span aria-hidden="true" className="text-amber-500">
                    ★
                  </span>
                  <span className="max-md:sr-only">Saved</span>
                </button>
              </div>
              {showToBox && (
                <DestinationBox
                  to={toPlace}
                  near={viewCentre}
                  onChoose={chooseTo}
                  onClear={clearTo}
                />
              )}
            </div>
          }
          collapseKey={destinationKey}
          revealKey={routeKey}
        >
          {/* the game HUD: first in the side card; on a phone it shows once the sheet is
              swiped up, so the resting sheet holds only the answer (v1.9, BC-L1) */}
          <div className="flex items-center justify-end gap-2 pb-3 max-md:in-data-[state=collapsed]:hidden">
            <RiderButton onOpen={() => setRiderOpen(true)} />
            <QuestLog />
            <SoundToggle />
          </div>
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
              onModeChange={(m) => {
                sfx().play("select");
                setMode(m);
                // the destination may have changed on the other tab, and the bus with it
                if (m === "bus" && point) setBusChoice(null);
              }}
              resorts={resorts.data ?? []}
              selectedResortId={selectedResortId}
              onSelectResort={selectResort}
              hasOrigin={origin !== null}
              placeStrip={
                <TripPanel
                  from={fromPlace}
                  stops={mode === "bus" ? [] : tripStops}
                  canAddStop={canAddStop}
                  near={viewCentre}
                  onAddStop={() =>
                    setStops((list) => [
                      ...list,
                      { key: newStopKey(), place: null },
                    ])
                  }
                  onRemoveStop={(key) =>
                    setStops((list) => list.filter((s) => s.key !== key))
                  }
                  onFillStop={fillStop}
                  onClearFrom={() => {
                    clearOrigin();
                    setSearchKey((k) => k + 1);
                  }}
                />
              }
              onStart={
                mode === "bus" || !pilotAvailable ? undefined : startPilot
              }
              startKind={proximity === "far" ? "preview" : "start"}
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
                  // the resort itself, not a tapped bus's: that would collapse the list.
                  // Only a known one: a stale link must not say there are no shuttles
                  onlyResortId={
                    resorts.data?.some((r) => r.id === destinationResortId)
                      ? destinationResortId
                      : null
                  }
                  place={
                    busPlace && {
                      name: busPlace.name,
                      result: loadable(busToPlace),
                      onClear: clearTo,
                    }
                  }
                  night={loadable(night)}
                  showNight={showNight}
                  onShowNightChange={setShowNight}
                  departAt={departAt}
                  onDepartAtChange={setDepartAt}
                  selected={busChoice}
                  onSelect={setBusChoice}
                  // only once the walk to the stop is known: it is the first leg
                  onStart={
                    routeQuery.isPending || !pilotAvailable
                      ? undefined
                      : startBusPilot
                  }
                  startNote={busNote}
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
      {/* after the sheet in the DOM, so Tab reaches the search box before the map's
          ~20 markers and links (T78); it paints below everything (z-index 0) */}
      <MapView
        resorts={resorts.data ?? []}
        shownResortIds={shownResortIds}
        selectedResortId={selectedResortId}
        origin={origin}
        destination={
          mode === "bus" ? (busPlace?.coord ?? null) : (target ?? null)
        }
        routes={
          pastWalk
            ? [] // at the stop or on the bus: the bus line is the route now
            : pilotRoute
              ? [pilotRoute]
              : routes
        }
        activeRoute={pilotRoute ? 0 : activeRoute}
        onSelectRoute={setActiveRoute}
        highlight={pilotRoute ? null : highlight}
        ride={mapRide}
        pilot={mapPilot}
        lodging={lodgingPins}
        busStop={busStop}
        flyTo={flyTo}
        onLoad={() => setLoaded(true)}
        onViewChange={setView}
        onPickOrigin={(coord) => {
          // an open stop box takes the tap (Google: type, or put a point on the map)
          if (placingStop) {
            fillOpenStop({
              id: pinId(coord),
              name: "Dropped pin",
              coord,
              kind: "pin",
            });
            return;
          }
          setOrigin(coord);
          setOriginName(null);
          setOriginSource(null);
          // the From box then shows "Dropped pin", not an older label such as My hotel
          setSearchLabel(null);
        }}
        stops={
          mode === "bus"
            ? []
            : tripStops.flatMap((st) =>
                st.place
                  ? [{ coord: st.place.coord, name: st.place.name }]
                  : [],
              )
        }
        placingStop={placingStop}
        onDropPin={(coord, name) => setDroppedPin({ coord, name })}
        onMapTap={() => setDroppedPin(null)}
        droppedPin={piloting ? null : droppedPin}
        pinCard={pinCard}
        onSelectResort={(id) => {
          // while placing a stop, a resort marker is the stop, not a new destination
          const r = placingStop
            ? resorts.data?.find((x) => x.id === id)
            : undefined;
          const at = r?.accessPoints[0]?.coord;
          if (r && at) {
            fillOpenStop({
              id: r.id,
              name: r.name.en,
              coord: at,
              kind: "resort",
            });
            return;
          }
          selectResort(id);
        }}
        saved={savedMarkers}
        onSelectSaved={(id) => {
          const place = placingStop
            ? savedState.places.find((p) => p.id === id)
            : undefined;
          if (place) {
            fillOpenStop(place);
            return;
          }
          setSavedFocus(id);
          setSavedOpen(true);
        }}
      />
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
      {riderOpen && <MyRiderCard onClose={() => setRiderOpen(false)} />}
      {riderCode && (
        <SharedRiderCard code={riderCode} onClose={() => setRiderCode(null)} />
      )}
      <StampMoment />
      <TitleScreen />
    </main>
  );
}
