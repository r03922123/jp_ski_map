"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { DrivePanel, type RankingState } from "@/components/DrivePanel";
import {
  ModePanel,
  type PanelMode,
  type RouteState,
} from "@/components/ModePanel";
import { SearchBox } from "@/components/SearchBox";
import {
  ApiError,
  type Bbox,
  type Coord,
  fetchLodging,
  fetchRank,
  fetchResorts,
  fetchRoute,
} from "@/lib/api";
import {
  DEFAULT_RANK,
  parseViewState,
  type RankOptions,
  serializeViewState,
} from "@/lib/url-state";

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

const LODGING_MIN_ZOOM = 14;

export function MapShell() {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<PanelMode>("drive");
  const [origin, setOrigin] = useState<Coord | null>(null);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<Coord | null>(null);
  const [view, setView] = useState<{ bbox: Bbox; zoom: number } | null>(null);
  const [rankOptions, setRankOptions] = useState<RankOptions>(DEFAULT_RANK);

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
    setRankOptions(view.rank);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const search = serializeViewState({
      origin,
      mode,
      resortId: selectedResortId,
      rank: rankOptions,
    });
    window.history.replaceState(null, "", search);
  }, [ready, origin, mode, selectedResortId, rankOptions]);

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

  // Drive to the access point the ranking found nearest; otherwise the first one.
  const resort = resorts.data?.find((r) => r.id === selectedResortId);
  const nearestId = ranking.data?.find(
    (r) => r.resortId === selectedResortId,
  )?.accessPointId;
  const destination = (
    resort?.accessPoints.find((a) => a.id === nearestId) ??
    resort?.accessPoints[0]
  )?.coord;

  const routeMode = mode === "bus" ? null : mode;
  const route = useQuery({
    queryKey: ["route", routeMode, origin, destination],
    queryFn: () => fetchRoute(routeMode!, origin!, destination!),
    enabled: Boolean(routeMode && origin && destination),
    retry: false,
  });

  const routeState: RouteState = !route.isEnabled
    ? { status: "idle" }
    : route.isPending
      ? { status: "loading" }
      : route.isError
        ? {
            status: "error",
            error:
              route.error instanceof ApiError ? route.error.code : "unknown",
          }
        : { status: "success", data: route.data };

  const routeData = routeState.status === "success" ? routeState.data : null;

  return (
    <main
      className="fixed inset-0"
      data-map-loaded={loaded}
      data-route-points={routeData?.geometry.coordinates.length ?? 0}
      data-lodging-pins={lodgingPins.length}
    >
      <MapView
        resorts={resorts.data ?? []}
        selectedResortId={selectedResortId}
        origin={origin}
        route={routeData}
        lodging={lodgingPins}
        flyTo={flyTo}
        onLoad={() => setLoaded(true)}
        onViewChange={setView}
        onPickOrigin={setOrigin}
        onSelectResort={setSelectedResortId}
      />
      <BottomSheet label="Directions">
        <div className="mb-3">
          <SearchBox
            onSelect={(place) => {
              setOrigin(place.coord);
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
