import { describe, expect, it } from "vitest";
import {
  type CameraWishes,
  decideCamera,
  NOTHING_SERVED,
} from "@/lib/map-camera";
import type { LngLat } from "@/lib/route-geo";

// What MapView's camera does, decided without a map: which move goes when several are due,
// and what waits for what (MapView.test.tsx checks the moves MapLibre receives).
const NONE: CameraWishes = {
  mapReady: true,
  fingerDown: false,
  piloting: false,
  route: { key: "", lines: [], ends: [], slimSheet: false },
  lone: null,
  inView: () => false,
  flyTo: null,
  pin: null,
  ski: null,
  skiSettled: true,
  follow: null,
};
const ROUTE = {
  key: "walk:600",
  lines: [
    [
      [137.85, 36.69],
      [137.86, 36.7],
    ] as LngLat[],
  ],
  ends: [[137.84, 36.69] as LngLat],
  slimSheet: false,
};
const OTHER_ROUTE = { ...ROUTE, key: "walk:900" };
const LONE = { key: "137.85,36.69/400x800", at: [137.85, 36.69] as LngLat };
const PIN = { key: "36.7,137.85", at: [137.85, 36.7] as LngLat };
const RUN = {
  key: "r1",
  bounds: [
    [137.8, 36.7],
    [137.81, 36.71],
  ] as [LngLat, LngLat],
};
const camera = (lng: number) => ({
  key: `${lng}`,
  camera: { center: [lng, 36.7] as LngLat, bearing: 0, pitch: 45, zoom: 16 },
});

/** The camera over successive commits: each call is one decision. */
function newCamera() {
  let served = NOTHING_SERVED;
  return (wishes: Partial<CameraWishes>) => {
    const next = decideCamera(served, { ...NONE, ...wishes });
    served = next.served;
    return next.command;
  };
}

describe("decideCamera", () => {
  it("a pin that replaces the ski card mid-press causes no fit", () => {
    const step = newCamera();
    expect(step({ route: ROUTE, ski: RUN })).toEqual({
      kind: "frameSki",
      bounds: RUN.bounds,
    });
    // the finger is down: the long-press drops a pin, which takes the card's place
    expect(step({ route: ROUTE, fingerDown: true, pin: PIN })).toBeNull();
    // lifted: the pin's own ease frames it, and the route is not fitted then or later
    expect(step({ route: ROUTE, pin: PIN })).toEqual({
      kind: "centre",
      at: PIN.at,
    });
    expect(step({ route: ROUTE, pin: PIN })).toBeNull();
  });

  it("the route waits while a ski card is open, and closing it fits the route again", () => {
    const step = newCamera();
    expect(step({ route: ROUTE })?.kind).toBe("fitRoute");
    expect(step({ route: ROUTE, ski: RUN })?.kind).toBe("frameSki");
    // the route fitted before the card opened is fitted again
    expect(step({ route: ROUTE })?.kind).toBe("fitRoute");
    // a new route while the card is open waits for it to close
    step({ route: ROUTE, ski: RUN });
    expect(step({ route: OTHER_ROUTE, ski: RUN })).toBeNull();
    expect(step({ route: OTHER_ROUTE })?.kind).toBe("fitRoute");
  });

  it("navigating holds the route fit, and the route is fitted again after", () => {
    const step = newCamera();
    expect(step({ route: ROUTE })?.kind).toBe("fitRoute");
    expect(step({ route: ROUTE, piloting: true })).toBeNull();
    expect(step({ route: ROUTE })?.kind).toBe("fitRoute");
  });

  it("piloting blocks the ski frame", () => {
    const step = newCamera();
    expect(step({ piloting: true, ski: RUN })).toBeNull();
    expect(step({ piloting: true, ski: RUN })).toBeNull();
    // navigation ends with the card still open: framed now
    expect(step({ ski: RUN })).toEqual({
      kind: "frameSki",
      bounds: RUN.bounds,
    });
  });

  it("the ski frame waits for the sheet to settle and for the finger to lift", () => {
    const step = newCamera();
    expect(step({ ski: RUN, skiSettled: false })).toBeNull();
    expect(step({ ski: RUN, fingerDown: true })).toBeNull();
    expect(step({ ski: RUN })?.kind).toBe("frameSki");
  });

  it("the follow camera catches up when the finger lifts", () => {
    const step = newCamera();
    expect(step({ piloting: true, follow: camera(137.85) })?.kind).toBe(
      "follow",
    );
    // a GPS fix under the finger
    const fix = camera(137.86);
    expect(step({ piloting: true, follow: fix, fingerDown: true })).toBeNull();
    expect(step({ piloting: true, follow: fix })).toEqual({
      kind: "follow",
      camera: fix.camera,
    });
    // a press with no new fix: it catches up all the same
    step({ piloting: true, follow: fix, fingerDown: true });
    expect(step({ piloting: true, follow: fix })?.kind).toBe("follow");
  });

  // only the map's size in the route's key waits for the finger (MapView holds it back,
  // and MapView.test.tsx checks the refit on the lift)
  it("a new route is fitted even under a finger, as is a search's flight", () => {
    const step = newCamera();
    expect(step({ route: ROUTE, fingerDown: true })?.kind).toBe("fitRoute");
    expect(
      step({ fingerDown: true, mapReady: false, flyTo: { lat: 1, lng: 2 } }),
    ).toEqual({ kind: "fly", at: [2, 1] });
  });

  it.each([
    ["route", { route: ROUTE }, { route: OTHER_ROUTE }],
    ["lone end", { lone: LONE }, { lone: { ...LONE, key: "other" } }],
    ["dropped pin", { pin: PIN }, { pin: { ...PIN, key: "other" } }],
    ["ski card", { ski: RUN }, { ski: { ...RUN, key: "r2" } }],
    [
      "follow camera",
      { piloting: true, follow: camera(137.85) },
      { piloting: true, follow: camera(137.86) },
    ],
  ] as [
    string,
    Partial<CameraWishes>,
    Partial<CameraWishes>,
  ][])("each %s key moves the camera once", (_, wish, next) => {
    const step = newCamera();
    expect(step(wish)).not.toBeNull();
    // a parent re-render hands over equal values in new objects
    expect(step(structuredClone(wish))).toBeNull();
    expect(step(next)).not.toBeNull();
  });

  it("a closed pin or card is forgotten: the same one again moves the camera again", () => {
    const step = newCamera();
    expect(step({ pin: PIN })).not.toBeNull();
    step({});
    expect(step({ pin: PIN })).not.toBeNull();
    expect(step({ ski: RUN })).not.toBeNull();
    step({});
    expect(step({ ski: RUN })).not.toBeNull();
  });

  it("a search's flight replaces the lone end's ease, and each new result flies", () => {
    const step = newCamera();
    const found = { lat: 36.71, lng: 137.86 };
    const lone = { key: "found", at: [found.lng, found.lat] as LngLat };
    expect(step({ lone, flyTo: found })).toEqual({
      kind: "fly",
      at: [137.86, 36.71],
    });
    expect(step({ lone, flyTo: found })).toBeNull();
    expect(step({ lone, flyTo: { ...found } })?.kind).toBe("fly");
  });

  it("a lone end already in view stays put, and is not eased to later", () => {
    const step = newCamera();
    expect(step({ lone: LONE, inView: () => true })).toBeNull();
    expect(step({ lone: LONE })).toBeNull();
  });

  it("wishes due together: the highest moves the camera, the lower ones count as served", () => {
    const step = newCamera();
    const all = { route: ROUTE, lone: LONE, pin: PIN };
    expect(step({ ...all, mapReady: false })).toBeNull();
    expect(step(all)).toEqual({ kind: "centre", at: PIN.at });
    expect(step(all)).toBeNull();
    // a lone end that shows already leaves the camera to the route fit due with it
    const later = newCamera();
    expect(later({ route: ROUTE, lone: LONE, inView: () => true })?.kind).toBe(
      "fitRoute",
    );
  });

  it("fits the routes with their end markers, and nothing when no route is drawn", () => {
    const step = newCamera();
    expect(step({ route: ROUTE })).toEqual({
      kind: "fitRoute",
      bounds: [
        [137.84, 36.69],
        [137.86, 36.7],
      ],
      slimSheet: false,
    });
    expect(step({ route: { ...ROUTE, key: "none", lines: [] } })).toBeNull();
  });
});
