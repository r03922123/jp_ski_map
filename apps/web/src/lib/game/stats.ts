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

/**
 * Whether the journey has arrived: a bus journey with the bus (its navigated route is
 * only the walk to the boarding stop), anything else when the navigator says so.
 */
export function journeyArrived(
  busPhase: "walk" | "wait" | "ride" | "arrived" | null,
  navPhase: string,
): boolean {
  return busPhase !== null ? busPhase === "arrived" : navPhase === "arrived";
}

/** A finished journey's km by mode. */
export function tripKm({
  mode,
  routeM,
  bus,
}: {
  mode: "drive" | "walk" | "bus";
  /** the navigated route (for a bus journey: the walk to the stop) */
  routeM: number;
  bus?: { alongM: number; lineM: number; walkIsLine: boolean };
}): Partial<Record<Mode, number>> {
  if (mode === "bus" && bus) {
    return {
      // started at the stop: the "walk" leg is the bus line itself, not walking
      walk: bus.walkIsLine ? 0 : round2(routeM / 1000),
      bus: coveredKm(bus.alongM, bus.lineM),
    };
  }
  return { [mode === "walk" ? "walk" : "drive"]: round2(routeM / 1000) };
}
