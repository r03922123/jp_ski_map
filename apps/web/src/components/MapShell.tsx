"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ModePanel,
  type PanelMode,
  type RouteState,
} from "@/components/ModePanel";
import { ApiError, type Coord, fetchResorts, fetchRoute } from "@/lib/api";

// MapLibre needs WebGL and `window`, so the map is rendered in the browser only.
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function MapShell() {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<PanelMode>("drive");
  const [origin, setOrigin] = useState<Coord | null>(null);
  const [selectedResortId, setSelectedResortId] = useState<string | null>(null);

  const resorts = useQuery({ queryKey: ["resorts"], queryFn: fetchResorts });
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
    >
      <MapView
        resorts={resorts.data ?? []}
        selectedResortId={selectedResortId}
        origin={origin}
        route={routeData}
        onLoad={() => setLoaded(true)}
        onPickOrigin={setOrigin}
        onSelectResort={setSelectedResortId}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 md:w-96">
        <div className="pointer-events-auto">
          <ModePanel
            mode={mode}
            onModeChange={setMode}
            resorts={resorts.data ?? []}
            selectedResortId={selectedResortId}
            onSelectResort={setSelectedResortId}
            hasOrigin={origin !== null}
            route={routeState}
          />
        </div>
      </div>
    </main>
  );
}
