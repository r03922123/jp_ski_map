import type { Fix, PreparedRoute, Projection } from "@/lib/nav/project";
import type { LngLat } from "@/lib/route-geo";

export type Camera = {
  center: LngLat;
  bearing: number;
  pitch: number;
  zoom: number;
};

/** Below this the GPS heading is noise (standing at a light); face the road instead. */
const HEADING_MIN_SPEED_MPS = 1.5;

function bearingDeg([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

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
