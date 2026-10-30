import type { Fix, PreparedRoute, Projection } from "@/lib/nav/project";
import { bearingDeg, type LngLat } from "@/lib/route-geo";

export type Camera = {
  center: LngLat;
  bearing: number;
  pitch: number;
  zoom: number;
};

/** Below this the GPS heading is noise (standing at a light); face the road instead. */
const HEADING_MIN_SPEED_MPS = 1.5;

/** Heading-up follow camera: tilted, centred on the snapped puck, zoomed out with speed. */
export function cameraFor(r: PreparedRoute, p: Projection, fix: Fix): Camera {
  const moving =
    fix.speedMps !== null &&
    fix.speedMps > HEADING_MIN_SPEED_MPS &&
    fix.headingDeg !== null;
  const a = r.coords[p.index];
  const b = r.coords[p.index + 1] ?? a;
  const drive = r.route.mode === "drive";
  const kmh = (fix.speedMps ?? 0) * 3.6;
  return {
    center: p.point,
    bearing: moving ? (fix.headingDeg as number) : bearingDeg(a, b),
    pitch: drive ? 60 : 45,
    zoom: drive ? Math.min(17.5, Math.max(15.5, 17.5 - kmh / 40)) : 18,
  };
}
