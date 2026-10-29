"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { BusPanel } from "@/components/BusPanel";
import { DestinationPicker } from "@/components/DestinationPicker";
import { DrivePanel, type RankingState } from "@/components/DrivePanel";
import {
  ModePanel,
  type PanelMode,
  type RouteState,
} from "@/components/ModePanel";
import { PoiList, type PoiListState } from "@/components/PoiList";
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
  DEFAULT_RANK,
  type DestinationCategory,
  parseViewState,
  type RankOptions,
  serializeViewState,
} from "@/lib/url-state";

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
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [category, setCategory] = useState<DestinationCategory>("resorts");
  const [poiId, setPoiId] = useState<string | null>(null);
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
    });
    window.history.replaceState(null, "", search);
  }, [ready, origin, mode, selectedResortId, poiId, category, rankOptions]);

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
    mode === "bus" ? busStop : poiCategory ? poiTarget : destination;
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
  const routeLayers = [
    ...routes.map((_, i) =>
      mode === "bus" ? "walk" : i === activeRoute ? "primary" : "alternate",
    ),
    ...(rideLeg ? ["ride"] : []),
  ].join(",");

  return (
    <main
      className="fixed inset-0"
      data-map-loaded={loaded}
      data-route-points={routeData?.geometry.coordinates.length ?? 0}
      data-route-layers={routeLayers}
      data-lodging-pins={lodgingPins.length}
    >
      <MapView
        resorts={resorts.data ?? []}
        selectedResortId={selectedResortId}
        origin={origin}
        destination={mode === "bus" ? null : (target ?? null)}
        routes={routes}
        activeRoute={activeRoute}
        onSelectRoute={setActiveRoute}
        highlight={highlight}
        ride={rideLeg}
        lodging={lodgingPins}
        busStop={busStop}
        flyTo={flyTo}
        onLoad={() => setLoaded(true)}
        onViewChange={setView}
        onPickOrigin={(coord) => {
          setOrigin(coord);
          setOriginName(null);
        }}
        onSelectResort={setSelectedResortId}
      />
      <BottomSheet label="Directions">
        <div className="mb-3">
          <SearchBox
            onSelect={(place) => {
              setOrigin(place.coord);
              setOriginName(place.name);
              setFlyTo(place.coord);
            }}
          />
        </div>
        <ModePanel
          mode={mode}
          onModeChange={setMode}
          resorts={resorts.data ?? []}
          selectedResortId={selectedResortId}
          onSelectResort={setSelectedResortId}
          hasOrigin={origin !== null}
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
            <DestinationPicker value={category} onChange={setCategory} />
          }
          poiPanel={
            poiCategory ? (
              <PoiList
                state={poiState}
                selectedId={poiId}
                onSelect={(p) => setPoiId(p.id)}
              />
            ) : undefined
          }
          drivePanel={
            <DrivePanel
              options={rankOptions}
              onOptionsChange={setRankOptions}
              ranking={rankingState}
              selectedResortId={selectedResortId}
              onSelectResort={setSelectedResortId}
            />
          }
        />
      </BottomSheet>
    </main>
  );
}
