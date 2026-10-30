import { useEffect, useRef, useState } from "react";
import type { Coord, Mode, Route } from "@/lib/api";
import type { Fix } from "@/lib/nav/project";
import type { PilotStatus } from "@/lib/nav/use-pilot";

/** At most one reroute request this often (SPEC-pilot). */
export const REROUTE_MIN_INTERVAL_MS = 10_000;

export type RerouteState = "idle" | "rerouting" | "failed";

type Args = {
  phase: PilotStatus["phase"];
  fix: Fix | null;
  mode: Mode;
  target: Coord | null;
  fetchRoute: (mode: Mode, from: Coord, to: Coord) => Promise<Route>;
  onNewRoute: (route: Route) => void;
  /** keep going on the old route (the caller restarts matching on it) */
  onFailure: () => void;
};

/**
 * Off the route → ask for a new one from where the user is to the same destination,
 * throttled. Only the current position leaves the device (SPEC-pilot boundaries).
 */
export function useReroute(args: Args): RerouteState {
  const [state, setState] = useState<RerouteState>("idle");
  const [retry, setRetry] = useState(0);
  const lastAttempt = useRef(Number.NEGATIVE_INFINITY);
  const inFlight = useRef(false);
  const latest = useRef(args);
  latest.current = args;

  const off =
    args.phase === "offRoute" && args.fix !== null && args.target !== null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` re-runs a throttled attempt
  useEffect(() => {
    if (!off || inFlight.current) return;
    const wait = lastAttempt.current + REROUTE_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      const timer = setTimeout(() => setRetry((n) => n + 1), wait);
      return () => clearTimeout(timer);
    }
    const { fix, mode, target, fetchRoute } = latest.current;
    if (!fix || !target) return;
    lastAttempt.current = Date.now();
    inFlight.current = true;
    setState("rerouting");
    fetchRoute(mode, { lat: fix.lat, lng: fix.lng }, target).then(
      (route) => {
        inFlight.current = false;
        setState("idle");
        latest.current.onNewRoute(route);
      },
      () => {
        inFlight.current = false;
        setState("failed");
        latest.current.onFailure();
      },
    );
  }, [off, retry]);

  return state;
}
