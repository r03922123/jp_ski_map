import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { PanelMode, RouteState } from "@/components/ModePanel";
import {
  ApiError,
  type Coord,
  fetchPath,
  fetchRoutes,
  type Mode,
  type Route,
} from "@/lib/api";

/** The route between the trip's ends, through its stops; shared by the panel and the mode tabs. */
function routesQuery(
  routeMode: Mode,
  origin: Coord | null,
  target: Coord | null | undefined,
  viaStops: Coord[],
) {
  return {
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
  };
}

const TAB_MODES: Mode[] = ["drive", "walk"];

/**
 * Each mode's travel time for its tab (v1.24, Google's mode row): the primary route's
 * seconds, once known. Same query as the panel's, so the open tab costs no extra request.
 */
export function useModeDurations({
  origin,
  target,
  viaStops,
}: {
  origin: Coord | null;
  /** null: no destination both modes share (a Food or Konbini list) */
  target: Coord | null | undefined;
  viaStops: Coord[];
}): Partial<Record<Mode, number>> {
  const results = useQueries({
    queries: TAB_MODES.map((m) => routesQuery(m, origin, target, viaStops)),
  });
  return Object.fromEntries(
    TAB_MODES.flatMap((m, i) => {
      const s = results[i].data?.primary.durationS;
      return s === undefined ? [] : [[m, s]];
    }),
  );
}

/**
 * The planner's route between the trip's ends: the options, the one chosen, and the step
 * highlighted on the map. With stops it is one trip through them, with no alternates.
 */
export function useRoutes({
  mode,
  routeMode,
  origin,
  target,
  viaStops,
}: {
  mode: PanelMode;
  /** in bus mode, "walk": the route shown is the walk to the boarding stop */
  routeMode: Exclude<PanelMode, "bus">;
  origin: Coord | null;
  target: Coord | null | undefined;
  viaStops: Coord[];
}) {
  const routeQuery = useQuery(routesQuery(routeMode, origin, target, viaStops));
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

  return {
    routes,
    routeState,
    /** the walk to the bus stop is still being asked for */
    isPending: routeQuery.isPending,
    activeRoute,
    setActiveRoute,
    highlight,
    setHighlight,
  };
}
