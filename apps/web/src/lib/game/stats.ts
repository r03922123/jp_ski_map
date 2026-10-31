import type { RiderState } from "@/lib/game/rider";

type Mode = "bus" | "drive" | "walk";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Distance actually covered along a route, in km (SPEC-progression "Stats"). */
export function coveredKm(alongM: number, totalM: number): number {
  return round2(Math.min(Math.max(alongM, 0), totalM) / 1000);
}

/** A navigated trip's kilometres by mode; it counts as a trip only if it arrived. */
export function addTrip(
  rider: RiderState,
  km: Partial<Record<Mode, number>>,
  arrived: boolean,
): RiderState {
  const total = { ...rider.stats.km };
  for (const [mode, d] of Object.entries(km) as [Mode, number][]) {
    total[mode] = round2(total[mode] + Math.max(d, 0));
  }
  return {
    ...rider,
    stats: { km: total, trips: rider.stats.trips + (arrived ? 1 : 0) },
  };
}
