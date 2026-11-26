import type { Coord } from "@/lib/api";
import type { Camera } from "@/lib/nav/camera";
import { type LngLat, routeBounds } from "@/lib/route-geo";

/**
 * What the map's parts want the camera to show, read once per commit. A wish's key names
 * it: the camera moves once per key, and a new key is a new wish.
 */
export type CameraWishes = {
  mapReady: boolean;
  /** A finger or mouse button is down on the map, as it is when the decision is made. */
  fingerDown: boolean;
  piloting: boolean;
  /** The drawn routes (maybe none) and the end markers, which stand off the road. */
  route: {
    key: string;
    lines: LngLat[][];
    ends: LngLat[];
    slimSheet: boolean;
  };
  /** One end and no route yet. */
  lone: { key: string; at: LngLat } | null;
  /** Whether a point already shows in the part of the map the panels leave clear. */
  inView: (at: LngLat) => boolean;
  /** A search result: each new object is a new flight. */
  flyTo: Coord | null;
  /** The dropped pin. */
  pin: { key: string; at: LngLat } | null;
  /** The open run, lift or resort card's whole lines (SPEC-ski-runs v1.5). */
  ski: { key: string; bounds: [LngLat, LngLat] } | null;
  /** The sheet has had time to settle since the ski card, finger, map or navigation changed. */
  skiSettled: boolean;
  /** Navigation's follow camera, while it follows. */
  follow: { key: string; camera: Camera } | null;
};

/** The key each wish was last served for ("" for none). */
export type CameraMemory = {
  route: string;
  lone: string;
  flyTo: Coord | null;
  pin: string;
  ski: string;
  follow: string;
  /** the ski card that was open at the last decision */
  skiOpen: string;
};

export const NOTHING_SERVED: CameraMemory = {
  route: "",
  lone: "",
  flyTo: null,
  pin: "",
  ski: "",
  follow: "",
  skiOpen: "",
};

export type CameraCommand =
  | { kind: "fitRoute"; bounds: [LngLat, LngLat]; slimSheet: boolean }
  | { kind: "centre"; at: LngLat }
  | { kind: "fly"; at: LngLat }
  | { kind: "frameSki"; bounds: [LngLat, LngLat] }
  | { kind: "follow"; camera: Camera };

/**
 * The one camera move to make now, and what the camera then remembers. Wishes due at the
 * same time go by rank: follow camera, ski frame, dropped pin, search flight, lone end,
 * route fit. A lower one counts as served, since MapLibre's next move would replace it.
 */
export function decideCamera(
  served: CameraMemory,
  w: CameraWishes,
): { command: CameraCommand | null; served: CameraMemory } {
  // MapLibre's easeTo stops its gesture handlers, so a move that starts under a finger
  // cancels the pan (Task 67): these wait for the lift. The route fit and the flight don't.
  const free = w.mapReady && !w.fingerDown;
  // navigating, the follow camera owns the view (a reroute must not zoom out); with a ski
  // card open its lines do, and closing the card fits the route again
  const routeYields = w.piloting || w.ski !== null;
  // a long-pressed pin took the ski card's place, finger still down: the pin's own ease
  // frames it, and a route fit now would start inside the press
  const pinReplacedCard =
    served.skiOpen !== "" && w.ski === null && w.pin !== null;

  const follow = free && w.follow?.key !== served.follow ? w.follow : null;
  const ski =
    free && !w.piloting && w.skiSettled && w.ski?.key !== served.ski
      ? w.ski
      : null;
  const pin = free && w.pin?.key !== served.pin ? w.pin : null;
  const flyTo = w.flyTo !== served.flyTo ? w.flyTo : null;
  const lone =
    free && !w.piloting && w.lone?.key !== served.lone ? w.lone : null;
  const route =
    w.mapReady && !routeYields && w.route.key !== served.route ? w.route : null;

  const command: CameraCommand | null =
    (follow && { kind: "follow", camera: follow.camera }) ||
    (ski && { kind: "frameSki", bounds: ski.bounds }) ||
    (pin && { kind: "centre", at: pin.at }) ||
    (flyTo && { kind: "fly", at: [flyTo.lng, flyTo.lat] }) ||
    (lone && !w.inView(lone.at) && { kind: "centre", at: lone.at }) ||
    (route && !pinReplacedCard && fitRoute(route)) ||
    null;
  return {
    command,
    served: {
      // after a press, or a pause in following, the camera catches up
      follow: w.fingerDown || !w.follow ? "" : (follow?.key ?? served.follow),
      // a closed card or pin is forgotten: picked again, it is framed again
      ski: w.ski ? (ski?.key ?? served.ski) : "",
      pin: w.pin ? (pin?.key ?? served.pin) : "",
      flyTo: w.flyTo,
      lone: lone?.key ?? served.lone,
      // the route is fitted again when it gets the view back
      route: routeYields ? "" : (route?.key ?? served.route),
      skiOpen: w.ski?.key ?? "",
    },
  };
}

function fitRoute({
  lines,
  ends,
  slimSheet,
}: CameraWishes["route"]): CameraCommand | null {
  const points = [...lines.flat(), ...ends];
  return lines.length > 0 && points.length >= 2
    ? { kind: "fitRoute", bounds: routeBounds(points), slimSheet }
    : null;
}
