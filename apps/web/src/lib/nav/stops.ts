import type { Coord } from "@/lib/api";
import type { PreparedRoute } from "@/lib/nav/project";

const STOP_ARRIVAL = /^Arrive at stop (\d+)\b/;

/**
 * The trip's stops still ahead of `alongM` on this route, in order. A reroute goes
 * through these, so leaving the route doesn't silently drop a stop. A route made with
 * stops has an "Arrive at stop N" step at each one (SPEC-web-app v1.4).
 */
export function stopsAhead(
  r: PreparedRoute,
  alongM: number,
  stops: Coord[],
): Coord[] {
  return stops.filter((_, i) => {
    const step = r.route.steps.find(
      (s) => STOP_ARRIVAL.exec(s.instruction)?.[1] === String(i + 1),
    );
    if (!step) return true; // can't place it: keep it
    return r.cum[step.shapeRange[0]] > alongM;
  });
}
