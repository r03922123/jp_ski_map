import { useEffect, useState } from "react";
import type { Coord } from "@/lib/api";
import { distanceM, type LngLat } from "@/lib/route-geo";

/**
 * Is the phone anywhere near the route? (SPEC-pilot "Preview when you're far away")
 * Far from the start → Preview instead of navigation; far from everything → no reroute
 * requests (the routing service only covers the region, so they could only fail).
 */

export const FAR_FROM_ROUTE_M = 1000;
export const NO_REROUTE_BEYOND_M = 50_000;

export function isFarFromRoute(at: Coord, routeStart: LngLat): boolean {
  return distanceM([at.lng, at.lat], routeStart) > FAR_FROM_ROUTE_M;
}

export function canReroute(from: Coord, to: Coord): boolean {
  return (
    distanceM([from.lng, from.lat], [to.lng, to.lat]) <= NO_REROUTE_BEYOND_M
  );
}

type Env = {
  geo: Pick<Geolocation, "getCurrentPosition"> | undefined;
  permissions: Pick<Permissions, "query"> | undefined;
};

const browserEnv = (): Env => ({
  geo: typeof navigator === "undefined" ? undefined : navigator.geolocation,
  permissions:
    typeof navigator === "undefined" ? undefined : navigator.permissions,
});

/**
 * The position, read only if location permission is already granted: never a prompt
 * nobody asked for. Null when unknown. The position stays on the device.
 */
export async function quietPosition(
  env: Env = browserEnv(),
): Promise<Coord | null> {
  if (!env.permissions || !env.geo) return null;
  try {
    const { state } = await env.permissions.query({ name: "geolocation" });
    if (state !== "granted") return null;
  } catch {
    return null;
  }
  const geo = env.geo;
  return new Promise((resolve) =>
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { maximumAge: 60_000, timeout: 8000 },
    ),
  );
}

/** "far" / "near" from the route's start when the position can be read quietly. */
export function useRouteProximity(
  routeStart: LngLat | null,
  enabled: boolean,
): "near" | "far" | "unknown" {
  const [state, setState] = useState<"near" | "far" | "unknown">("unknown");
  const key = routeStart ? routeStart.join() : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands for routeStart
  useEffect(() => {
    setState("unknown");
    if (!enabled || !routeStart) return;
    let live = true;
    void quietPosition().then((at) => {
      if (live && at) setState(isFarFromRoute(at, routeStart) ? "far" : "near");
    });
    return () => {
      live = false;
    };
  }, [key, enabled]);
  return state;
}
