import type { BusOption, Route } from "@/lib/api";
import {
  type Fix,
  type PreparedRoute,
  prepare,
  projectForward,
} from "@/lib/nav/project";
import { distanceM, type LngLat } from "@/lib/route-geo";

/**
 * One shuttle journey as a pure reducer (SPEC-pilot "bus pilot"):
 * walk to the stop → wait → ride (stops counted down) → arrived.
 * There is no live bus position, so riding is inferred from time and movement along
 * the bus line, with "I'm on the bus" as the manual fallback.
 */

export type BusPhase = "walk" | "wait" | "ride" | "arrived";

export type PlannedStop = {
  stopId: string;
  name: string;
  /** scheduled "HH:MM", or null where the timetable doesn't publish it */
  time: string | null;
  coord: LngLat | null;
  /** distance along the bus line, null for a stop we can't place */
  alongM: number | null;
};

export type BusPlan = {
  option: BusOption;
  line: PreparedRoute;
  stops: PlannedStop[];
  alightIndex: number;
  departsAtMs: number;
};

export type BusState = { phase: BusPhase; rideIndex: number; alongM: number };

const AT_STOP_M = 30;
const ARRIVE_M = 40;
const ON_LINE_M = 80;
const BOARDED_AFTER_M = 80; // moved this far along the line once it's time: on the bus
const EARLY_MS = 60_000; // buses leave a little early too
const PASSED_M = 30;
// a bus covers ground between sparse fixes; search the line well ahead
const BUS_LOOKAHEAD_M = 5000;

const ll = (c: { lat: number; lng: number }): LngLat => [c.lng, c.lat];
const fixAt = ([lng, lat]: LngLat): Fix => ({
  lat,
  lng,
  accuracyM: 0,
  speedMps: null,
  headingDeg: null,
  t: 0,
});

/** The bus line: the road path through the stops when known, else straight hops. */
export function planBus(option: BusOption, ridePath: Route | null): BusPlan {
  const located = option.rideStops.flatMap((s) =>
    s.coord ? [ll(s.coord)] : [],
  );
  const coordinates = ridePath
    ? (ridePath.geometry.coordinates as LngLat[])
    : located;
  const line = prepare({
    mode: "drive",
    durationS: option.rideS ?? 0,
    distanceM: 0,
    isEstimate: true,
    geometry: { type: "LineString", coordinates },
    steps: [],
  } as Route);
  let from = 0;
  const stops = option.rideStops.map((s): PlannedStop => {
    if (!s.coord) return { ...s, coord: null, alongM: null };
    const p = projectForward(
      line,
      fixAt(ll(s.coord)),
      from,
      ON_LINE_M,
      BUS_LOOKAHEAD_M,
    );
    from = p.index;
    return {
      stopId: s.stopId,
      name: s.name,
      time: s.time,
      coord: ll(s.coord),
      alongM: p.alongM,
    };
  });
  const alight = stops.findIndex((s) => s.stopId === option.alightStopId);
  return {
    option,
    line,
    stops,
    alightIndex: alight >= 0 ? alight : stops.length - 1,
    departsAtMs: Date.parse(option.departsAt),
  };
}

export function initialBus(): BusState {
  return { phase: "walk", rideIndex: 0, alongM: 0 };
}

export function boardManually(s: BusState): BusState {
  return s.phase === "arrived" ? s : { ...s, phase: "ride" };
}

export function reduceBus(
  s: BusState,
  plan: BusPlan,
  fix: Fix,
  nowMs: number,
  walkArrived = false,
): BusState {
  const here: LngLat = [fix.lng, fix.lat];
  const board = plan.stops[0];
  if (s.phase === "walk") {
    const atStop = board.coord && distanceM(board.coord, here) <= AT_STOP_M;
    return atStop || walkArrived ? { ...s, phase: "wait" } : s;
  }
  if (s.phase === "wait") {
    if (nowMs < plan.departsAtMs - EARLY_MS) return s;
    const p = projectForward(plan.line, fix, 0, ON_LINE_M, BUS_LOOKAHEAD_M);
    const moved = p.alongM - (board.alongM ?? 0);
    return p.offsetM <= ON_LINE_M && moved >= BOARDED_AFTER_M
      ? { phase: "ride", rideIndex: p.index, alongM: p.alongM }
      : s;
  }
  if (s.phase === "ride") {
    const p = projectForward(
      plan.line,
      fix,
      s.rideIndex,
      ON_LINE_M,
      BUS_LOOKAHEAD_M,
    );
    const next =
      p.offsetM <= ON_LINE_M
        ? {
            ...s,
            rideIndex: Math.max(s.rideIndex, p.index),
            alongM: Math.max(s.alongM, p.alongM), // a noisy fix never moves us back
          }
        : s;
    const alight = plan.stops[plan.alightIndex];
    const there =
      (alight.coord && distanceM(alight.coord, here) <= ARRIVE_M) ||
      (alight.alongM !== null && next.alongM >= alight.alongM - ARRIVE_M);
    return there ? { ...next, phase: "arrived" } : next;
  }
  return s;
}

/** What the ride screen shows: the next stop, stops to go, and "get off next". */
export function rideView(plan: BusPlan, s: BusState) {
  const nextIndex = plan.stops.findIndex(
    (st, i) =>
      i > 0 &&
      i <= plan.alightIndex &&
      st.alongM !== null &&
      st.alongM > s.alongM + PASSED_M,
  );
  const index = nextIndex >= 0 ? nextIndex : plan.alightIndex;
  return {
    next: plan.stops[index],
    upcoming: plan.stops.slice(index, plan.alightIndex + 1),
    stopsToGo: plan.alightIndex - index + 1,
    getOffNext: index === plan.alightIndex,
  };
}
