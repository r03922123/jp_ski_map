"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
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
  fetchResorts,
  fetchRoute,
} from "@/lib/api";
import { parseViewState, serializeViewState } from "@/lib/url-state";

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
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const search = serializeViewState({
      origin,
      mode,
      resortId: selectedResortId,
    });
    window.history.replaceState(null, "", search);
  }, [ready, origin, mode, selectedResortId]);

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
  const resort = resorts.data?.find((r) => r.id === selectedResortId);
  const destination = resort?.accessPoints[0]?.coord;

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
        />
      </BottomSheet>
    </main>
  );
}
