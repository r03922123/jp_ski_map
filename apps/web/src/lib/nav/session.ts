import {
  type Fix,
  type PreparedRoute,
  type Projection,
  projectForward,
} from "@/lib/nav/project";
import { distanceM } from "@/lib/route-geo";

/**
 * The navigator as a pure reducer: (state, fix) → state. Thresholds follow Organic Maps'
 * open-source routing session (Apache-2.0; see SPEC-pilot.md), reimplemented here:
 * a fix within the matching radius is "on route"; otherwise it counts towards leaving
 * the route (+2 when moving, +1 when slow or speed unknown) and more than 10 trips it.
 */

export type NavPhase = "following" | "offRoute" | "arrived";

export type NavState = {
  phase: NavPhase;
  /** segment of the last on-route match; the next search starts here */
  index: number;
  projection: Projection | null;
  lastGood: Projection | null;
  moveAway: number;
  lastDistanceM: number;
  /** before the first match: how far the user is from the route's start, else null */
  approachM: number | null;
};

export const OFF_ROUTE_LIMIT = 10; // kOnRouteMissedCount
const WEAK_GPS_M = 100; // too vague to judge; don't count it either way
const RUNAWAY_SENSITIVITY_M = 0.01;

const SETTINGS = {
  // matchingThresholdM, finishToleranceM, minSpeedForRouteRebuildMpS (Organic Maps), and
  // ours: approachM. A route starts on the nearest road, not at the hotel door, so until
  // the first match being this close to its start is "heading to it", not leaving it
  // (otherwise GPS jitter at the door would reroute, onto the same road, forever).
  drive: { matchM: 50, finishM: 20, minSpeedMps: 3 / 3.6, approachM: 250 },
  walk: { matchM: 20, finishM: 15, minSpeedMps: -1, approachM: 150 },
} as const;

export function initialNav(): NavState {
  return {
    phase: "following",
    index: 0,
    projection: null,
    lastGood: null,
    moveAway: 0,
    lastDistanceM: 0,
    approachM: null,
  };
}

export function reduceNav(s: NavState, r: PreparedRoute, fix: Fix): NavState {
  if (s.phase !== "following") return s; // arrived, or waiting for a new route
  const cfg = SETTINGS[r.route.mode];
  const radius = Math.max(cfg.matchM, fix.accuracyM);
  const p = projectForward(r, fix, s.index, radius);

  if (p.offsetM <= radius) {
    return {
      phase: r.totalM - p.alongM <= cfg.finishM ? "arrived" : "following",
      index: p.index,
      projection: p,
      lastGood: p,
      moveAway: 0,
      lastDistanceM: 0,
      approachM: null,
    };
  }
  if (!s.lastGood) {
    const toStart = distanceM(r.coords[0], [fix.lng, fix.lat]);
    if (toStart <= cfg.approachM) return { ...s, approachM: toStart };
  }
  if (fix.accuracyM > WEAK_GPS_M) return s;

  // distance from the last known spot on the route; only a change counts
  const ref = s.lastGood?.point ?? r.coords[0];
  const dist = distanceM(ref, [fix.lng, fix.lat]);
  if (Math.abs(dist - s.lastDistanceM) < RUNAWAY_SENSITIVITY_M) return s;
  const moving = fix.speedMps !== null && fix.speedMps >= cfg.minSpeedMps;
  const moveAway = s.moveAway + (moving ? 2 : 1);
  return {
    ...s,
    moveAway,
    lastDistanceM: dist,
    phase: moveAway > OFF_ROUTE_LIMIT ? "offRoute" : "following",
  };
}
