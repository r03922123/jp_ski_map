import { useEffect, useMemo, useState } from "react";
import type { Route } from "@/lib/api";
import { type Camera, cameraFor } from "@/lib/nav/camera";
import type { PositionError, PositionSource } from "@/lib/nav/position";
import { type Guidance, progress } from "@/lib/nav/progress";
import {
  type Fix,
  type PreparedRoute,
  type Projection,
  prepare,
} from "@/lib/nav/project";
import {
  initialNav,
  type NavPhase,
  type NavState,
  reduceNav,
} from "@/lib/nav/session";

export type PilotStatus = {
  /** "starting" until the first fix arrives */
  phase: NavPhase | "starting";
  error: PositionError | null;
  fix: Fix | null;
  nav: NavState;
  route: PreparedRoute | null;
  guidance: Guidance | null;
  camera: Camera | null;
};

type Live = { nav: NavState; fix: Fix | null; error: PositionError | null };
/** Rough speeds for the stretch to the route's start (not in Valhalla's times). */
const APPROACH_MPS = { drive: 8, walk: 1.3 } as const;
const START: Live = { nav: initialNav(), fix: null, error: null };

/** Runs the pure navigator (lib/nav/session) on fixes from `source` along `route`. */
export function usePilot(
  route: Route | null,
  source: PositionSource | null,
): PilotStatus {
  const prepared = useMemo(() => (route ? prepare(route) : null), [route]);
  const [live, setLive] = useState<Live>(START);

  useEffect(() => {
    setLive(START); // a new route (or a reroute) starts matching from its beginning
    if (!prepared || !source) return;
    return source.start(
      (fix) =>
        setLive((s) => ({
          nav: reduceNav(s.nav, prepared, fix),
          fix,
          error: null,
        })),
      (error) => setLive((s) => ({ ...s, error })),
    );
  }, [prepared, source]);

  const { projection, approachM } = live.nav;
  const fix = live.fix;
  // heading to the route: guide from its start, plus the gap to it
  const atStart: Projection | null =
    prepared && approachM !== null && fix && !projection
      ? {
          index: 0,
          t: 0,
          point: [fix.lng, fix.lat],
          offsetM: approachM,
          alongM: 0,
        }
      : null;
  const where = projection ?? atStart;
  let guidance = prepared && where ? progress(prepared, where) : null;
  if (guidance && atStart && prepared && approachM !== null) {
    guidance = {
      ...guidance,
      remainingM: guidance.remainingM + approachM,
      remainingS:
        guidance.remainingS + approachM / APPROACH_MPS[prepared.route.mode],
    };
  }
  return {
    phase: fix ? live.nav.phase : "starting",
    error: live.error,
    fix,
    nav: live.nav,
    route: prepared,
    guidance,
    camera: prepared && where && fix ? cameraFor(prepared, where, fix) : null,
  };
}
