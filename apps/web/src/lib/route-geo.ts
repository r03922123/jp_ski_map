/** Pure geometry for drawing routes: bounds, label anchors, step segments, map padding. */

export type LngLat = [number, number]; // GeoJSON order

const EARTH_M = 6_371_000;

export function distanceM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(a));
}

/** Initial compass bearing from a to b, degrees clockwise from north. */
export function bearingDeg([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const rad = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** [[west, south], [east, north]], the shape MapLibre's fitBounds takes. */
export function routeBounds(coords: LngLat[]): [LngLat, LngLat] {
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** The point `fraction` (0–1) of the way along the line, by distance. */
export function pointAlong(coords: LngLat[], fraction: number): LngLat {
  if (fraction <= 0 || coords.length < 2) return coords[0];
  const legs = coords.slice(1).map((c, i) => distanceM(coords[i], c));
  let remaining = legs.reduce((a, b) => a + b, 0) * Math.min(fraction, 1);
  for (let i = 0; i < legs.length; i++) {
    if (remaining <= legs[i] && legs[i] > 0) {
      const t = remaining / legs[i];
      const [a, b] = [coords[i], coords[i + 1]];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= legs[i];
  }
  return coords[coords.length - 1];
}

/**
 * Where to pin a route's ETA label. The primary goes halfway along; an alternate
 * goes on the vertex farthest from the other routes, where it visibly diverges
 * (otherwise both labels would sit on the shared stretch and overlap).
 */
export function labelAnchor(coords: LngLat[], others: LngLat[][]): LngLat {
  if (others.length === 0) return pointAlong(coords, 0.5);
  const otherPoints = others.flat();
  let best = coords[0];
  let bestGap = -1;
  for (const c of coords) {
    const gap = Math.min(...otherPoints.map((o) => distanceM(c, o)));
    if (gap > bestGap) {
      bestGap = gap;
      best = c;
    }
  }
  return best;
}

/** The coordinates of one step, from its inclusive `shapeRange`. */
export function segment(coords: LngLat[], [begin, end]: [number, number]) {
  return coords.slice(begin, end + 1);
}

const PANEL_WIDTH_PX = 384; // BottomSheet md:w-96
const PANEL_INSET_PX = 12; // md:left-3
const SHEET_FRACTION = 0.4; // collapsed bottom sheet, h-[40dvh]
const MD_BREAKPOINT_PX = 768;

/** fitBounds padding that keeps the route clear of the directions panel. */
export function mapPadding({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  if (width >= MD_BREAKPOINT_PX) {
    return {
      top: 60,
      right: 60,
      bottom: 60,
      left: PANEL_WIDTH_PX + PANEL_INSET_PX + 48,
    };
  }
  return {
    top: 72,
    right: 32,
    bottom: Math.round(height * SHEET_FRACTION) + 32,
    left: 32,
  };
}
