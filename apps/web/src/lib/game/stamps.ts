import type { Coord, Resort } from "@/lib/api";
import type { RiderState } from "@/lib/game/rider";
import { distanceM } from "@/lib/route-geo";

/**
 * Stamps come only from being at a resort (SPEC-progression "Stamps"). The position is
 * checked here and never stored: only the resort and the day are kept.
 */
export const ARRIVE_M = 150;
export const CHECK_IN_M = 300;
export const CHECK_IN_ACCURACY_M = 100;
export const MAX_VISITS = 100;

/** The calendar day in Japan, "YYYY-MM-DD". */
export function jstDate(at: Date): string {
  return new Date(at.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function metresTo(resort: Resort, at: Coord): number {
  return Math.min(
    ...resort.accessPoints.map((a) =>
      distanceM([a.coord.lng, a.coord.lat], [at.lng, at.lat]),
    ),
  );
}

/** The resort a trip ended at, if it ended within ARRIVE_M of one of its access points. */
export function arrivedAt(resorts: Resort[], at: Coord): Resort | null {
  return resorts.find((r) => metresTo(r, at) <= ARRIVE_M) ?? null;
}

export type CheckIn =
  | { ok: true }
  | { ok: false; reason: "far"; distanceM: number }
  | { ok: false; reason: "inaccurate" };

export function checkIn(
  resort: Resort,
  fix: { coord: Coord; accuracyM: number },
): CheckIn {
  if (fix.accuracyM > CHECK_IN_ACCURACY_M)
    return { ok: false, reason: "inaccurate" };
  const d = metresTo(resort, fix.coord);
  return d <= CHECK_IN_M
    ? { ok: true }
    : { ok: false, reason: "far", distanceM: d };
}

/** A visit on `date`: the first earns the stamp; after that, at most one per day. */
export function recordVisit(
  state: RiderState,
  resortId: string,
  date: string,
): { state: RiderState; stamped: boolean; visited: boolean } {
  const stamp = state.stamps[resortId];
  if (stamp?.visits.includes(date))
    return { state, stamped: false, visited: false };
  const next = stamp
    ? { ...stamp, visits: [...stamp.visits, date].slice(-MAX_VISITS) }
    : { resortId, firstAt: date, visits: [date] };
  return {
    state: { ...state, stamps: { ...state.stamps, [resortId]: next } },
    stamped: !stamp,
    visited: true,
  };
}
