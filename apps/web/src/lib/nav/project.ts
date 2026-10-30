import type { Route } from "@/lib/api";
import { distanceM, type LngLat } from "@/lib/route-geo";

/** One GPS reading, as the position source hands it to the navigator. */
export type Fix = {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  /** epoch ms */
  t: number;
};

/** A route with its cumulative distances precomputed, the navigator's working copy. */
export type PreparedRoute = {
  route: Route;
  coords: LngLat[];
  /** distance from the start to each vertex, metres */
  cum: number[];
  totalM: number;
};

/** Where a fix lands on the route: segment `index` (coords[index]→coords[index+1]) at `t`. */
export type Projection = {
  index: number;
  t: number;
  point: LngLat;
  offsetM: number;
  alongM: number;
};

/** How far ahead of the last match a new fix may land (≈ Organic Maps' forward window). */
const LOOKAHEAD_M = 1000;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQUATOR = 111_320;

export function prepare(route: Route): PreparedRoute {
  const coords = route.geometry.coordinates as LngLat[];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
  }
  return { route, coords, cum, totalM: cum[cum.length - 1] ?? 0 };
}

/** Perpendicular foot of `p` on segment a→b, in a local metric plane (fine at street scale). */
function onSegment(a: LngLat, b: LngLat, p: LngLat) {
  const kx = M_PER_DEG_LNG_EQUATOR * Math.cos((p[1] * Math.PI) / 180);
  const bx = (b[0] - a[0]) * kx;
  const by = (b[1] - a[1]) * M_PER_DEG_LAT;
  const px = (p[0] - a[0]) * kx;
  const py = (p[1] - a[1]) * M_PER_DEG_LAT;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.min(1, Math.max(0, (px * bx + py * by) / len2)) : 0;
  const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, point, offsetM: Math.hypot(px - bx * t, py - by * t) };
}

/**
 * Match a fix to the route, searching forward from segment `fromIndex` only.
 * The first stretch within `radiusM` wins (its local closest point), so on a route that
 * doubles back past itself the puck never jumps ahead to the later, nearby leg.
 * When nothing is within the radius the closest point in the window is returned, and
 * the caller treats the fix as off the route.
 */
export function projectForward(
  r: PreparedRoute,
  fix: Fix,
  fromIndex: number,
  radiusM = 50,
  lookaheadM = LOOKAHEAD_M,
): Projection {
  const p: LngLat = [fix.lng, fix.lat];
  const last = Math.max(0, r.coords.length - 2);
  const start = Math.min(Math.max(0, fromIndex), last);
  let best: Projection | null = null;
  let inRadius = false;
  for (let i = start; i <= last; i++) {
    if (r.cum[i] - r.cum[start] > lookaheadM) break;
    const b = r.coords[i + 1] ?? r.coords[i];
    const s = onSegment(r.coords[i], b, p);
    const segLen = r.cum[i + 1] - r.cum[i] || 0;
    const candidate: Projection = {
      index: i,
      t: s.t,
      point: s.point,
      offsetM: s.offsetM,
      alongM: r.cum[i] + segLen * s.t,
    };
    if (inRadius) {
      // walk to the bottom of this first in-radius dip, then stop
      if (candidate.offsetM < (best as Projection).offsetM - 0.01)
        best = candidate;
      else break;
    } else if (best === null || candidate.offsetM < best.offsetM) {
      best = candidate;
      inRadius = candidate.offsetM <= radiusM;
    } else if (candidate.offsetM <= radiusM) {
      best = candidate;
      inRadius = true;
    }
  }
  return (
    best ?? {
      index: 0,
      t: 0,
      point: r.coords[0],
      offsetM: distanceM(r.coords[0], p),
      alongM: 0,
    }
  );
}

/** The route split at the user's spot: what is behind them (drawn grey) and ahead. */
export function splitAt(
  coords: LngLat[],
  p: Pick<Projection, "index" | "t" | "point">,
): { covered: LngLat[]; ahead: LngLat[] } {
  return {
    covered: [...coords.slice(0, p.index + 1), p.point],
    ahead: [p.point, ...coords.slice(p.index + 1)],
  };
}
