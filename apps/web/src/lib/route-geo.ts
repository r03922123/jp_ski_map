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
export const MD_BREAKPOINT_PX = 768;
// v1.13, v1.18, v1.27: the From/To card on top of the map on phones, plus a margin: 106 px
// to its bottom edge (two 44 px rows, a 2 px gap, 4 px padding, 8 px from the top), its
// 4 px frame and 8 px. BottomSheet's expanded height reserves the same 118 (+48) in a
// Tailwind class: change them together
const TRIP_CARD_PX = 118;
// the start marker (Hero at 2x, 48 px) stands above its point (anchor "bottom");
// HeroMarker.test checks the sprite is this tall
export const MARKER_PX = 48;
// a landscape phone: 120 px of card (106 since v1.27: kept as an overestimate) + its 4 px frame + 4 px + a marker, and the
// bottom margin shrinks, so the markers still fit between the panels
const SHORT_SCREEN_PX = 480;
const SHORT_SCREEN_TOP_PX = 120 + 4 + 4 + MARKER_PX;
// a landscape phone with a route: the collapsed sheet is only its ETA + Start row
// (BottomSheet's slim height: the 22 px handle and the 61 px row; change them together)
export const SLIM_BAR_PX = 84;
// a fit with no map left between its paddings does nothing at all
const MIN_CLEAR_PX = 16;

/**
 * The status bar's and home indicator's heights in px (v1.19): the page runs under them,
 * so the trip card sits `top` lower and the sheet `bottom` higher. 0 outside the
 * home-screen app.
 */
export type SafeInsets = {
  top: number;
  bottom: number;
  /** a notched iPhone in landscape (≥ 812 px wide, so the side-card layout) */
  left?: number;
  right?: number;
};
const NO_INSETS: SafeInsets = { top: 0, bottom: 0 };

/** fitBounds padding that keeps the route and its end markers clear of the panels. */
export function mapPadding({
  width,
  height,
  slimSheet = false,
  safe = NO_INSETS,
}: {
  width: number;
  height: number;
  /** the sheet is a slim ETA + Start bar on a short screen (BottomSheet `slim`) */
  slimSheet?: boolean;
  safe?: SafeInsets;
}) {
  if (width >= MD_BREAKPOINT_PX) {
    return {
      top: 60 + safe.top,
      right: 60 + (safe.right ?? 0),
      bottom: 60 + safe.bottom,
      left: PANEL_WIDTH_PX + PANEL_INSET_PX + 48 + (safe.left ?? 0),
    };
  }
  const short = height < SHORT_SCREEN_PX;
  const bottom =
    (short && slimSheet
      ? SLIM_BAR_PX + 12
      : Math.round(height * SHEET_FRACTION) + (short ? 12 : 32)) + safe.bottom;
  const top =
    (short ? SHORT_SCREEN_TOP_PX : TRIP_CARD_PX + MARKER_PX) + safe.top;
  return {
    top: Math.min(top, Math.max(0, height - bottom - MIN_CLEAR_PX)),
    right: 32,
    bottom,
    left: 32,
  };
}
