import type { Coord, Route } from "@/lib/api";
import type { PreparedRoute } from "@/lib/nav/project";

/** A stop of the trip: `n` is its number in the trip (1, 2, …), kept across reroutes. */
export type NumberedStop = { n: number; coord: Coord };

/**
 * A stop this close ahead of the last on-route position counts as reached: its car park
 * entrance is often before the point the road route ends at (the destination's own
 * arrival radius is 15–20 m, see session.ts).
 */
export const STOP_REACHED_M = 30;

const STOP_ARRIVAL = /^Arrive at stop (\d+)\b/;

/**
 * The trip's stops still ahead of `alongM` on this route, in order. A reroute goes
 * through these, so leaving the route doesn't silently drop a stop. A route made with
 * stops has an "Arrive at stop N" step at each one (SPEC-web-app v1.4).
 */
export function stopsAhead(
  r: PreparedRoute,
  alongM: number,
  stops: NumberedStop[],
): NumberedStop[] {
  return stops.filter((stop) => {
    const step = r.route.steps.find(
      (s) => STOP_ARRIVAL.exec(s.instruction)?.[1] === String(stop.n),
    );
    if (!step) return true; // can't place it: keep it
    return r.cum[step.shapeRange[0]] - alongM > STOP_REACHED_M;
  });
}

/**
 * The server numbers stops 1, 2, … in the order it was given them; after a reroute that
 * is only the stops still ahead. Put the trip's own numbers back, so the banner agrees
 * with the numbered circles on the map.
 */
export function numberStops(route: Route, numbers: number[]): Route {
  return {
    ...route,
    steps: route.steps.map((s) => {
      const m = STOP_ARRIVAL.exec(s.instruction);
      const n = m ? numbers[Number(m[1]) - 1] : undefined;
      return n === undefined
        ? s
        : {
            ...s,
            instruction: s.instruction.replace(
              STOP_ARRIVAL,
              `Arrive at stop ${n}`,
            ),
          };
    }),
  };
}
