import { type RefObject, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  type CameraCommand,
  type CameraWishes,
  decideCamera,
  NOTHING_SERVED,
} from "@/lib/map-camera";
import {
  cardPadding,
  type LngLat,
  MD_BREAKPOINT_PX,
  mapPadding,
} from "@/lib/route-geo";
import { safeInsets } from "@/lib/safe-insets";

// BottomSheet's `duration-200` height transition, and a frame to spare
const SHEET_SETTLE_MS = 250;

/**
 * MapView's camera: after each commit, decideCamera picks the one move that is due, and
 * this runs it on MapLibre.
 */
export function useMapCamera(
  mapRef: RefObject<MapRef | null>,
  {
    pressed,
    pressing,
    ...wishes
  }: Omit<CameraWishes, "fingerDown" | "inView" | "skiSettled"> & {
    /** a finger on the map now: set before React sees the press (see MapView) */
    pressed: RefObject<boolean>;
    /** the same as rendered, so that a release decides again */
    pressing: boolean;
  },
) {
  // shortcut: waits out BottomSheet's 200 ms height transition (a new destination collapses
  // it) before measuring the card; watch the covers instead if the sheet's timing changes
  const skiKey = wishes.ski?.key ?? "";
  const skiWait = `${skiKey}/${pressing}/${wishes.mapReady}/${wishes.piloting}`;
  const [settled, setSettled] = useState("");
  useEffect(() => {
    if (!skiKey) return;
    const t = setTimeout(() => setSettled(skiWait), SHEET_SETTLE_MS);
    return () => clearTimeout(t);
  }, [skiKey, skiWait]);

  const served = useRef(NOTHING_SERVED);
  useEffect(() => {
    const map = mapRef.current;
    const next = decideCamera(served.current, {
      ...wishes,
      fingerDown: pressed.current,
      inView: (at) => map !== null && inClear(map, at),
      skiSettled: settled === skiWait,
    });
    served.current = next.served;
    if (map && next.command) run(map, next.command);
  });
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function run(map: MapRef, move: CameraCommand) {
  const ms = (duration: number) => (prefersReducedMotion() ? 0 : duration);
  switch (move.kind) {
    case "fitRoute":
      map.fitBounds(move.bounds, {
        padding: paddingOf(map, move.slimSheet),
        // replaces what navigation or a dropped pin left on the map: added to that, the
        // padding can exceed the map, and the fit silently does nothing
        absolutePadding: true,
        maxZoom: 16,
        pitch: 0,
        bearing: 0,
        duration: ms(700),
      });
      return;
    case "centre":
      map.easeTo({
        center: move.at,
        // the pin card covers less than the sheet's share, so the clear map's middle is clear
        padding: paddingOf(map),
        duration: ms(600),
      });
      return;
    case "fly":
      map.flyTo({ center: move.at, zoom: 14, padding: paddingOf(map) });
      return;
    case "frameSki":
      map.fitBounds(move.bounds, {
        padding: cardPaddingOf(map),
        // as the route fit: replaces what an ease left on the map instead of adding to it
        absolutePadding: true,
        maxZoom: 16,
        // the view navigation leaves is tilted
        pitch: 0,
        duration: ms(600),
      });
      return;
    case "follow": {
      const { center, bearing, pitch, zoom } = move.camera;
      map.easeTo({
        center,
        bearing,
        pitch,
        zoom,
        // the puck sits in the lower part of the screen, the road ahead above it
        padding: {
          top: map.getCanvas().clientHeight * 0.4,
          bottom: 0,
          left: 0,
          right: 0,
        },
        duration: ms(900),
      });
    }
  }
}

const paddingOf = (map: MapRef, slimSheet = false) => {
  const canvas = map.getCanvas();
  return mapPadding({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    slimSheet,
    safe: safeInsets(),
  });
};
/** Padding for the map above the open card, and on a phone the sheet under it (v1.5). */
const cardPaddingOf = (map: MapRef) => {
  const canvas = map.getCanvas();
  const phone = canvas.clientWidth < MD_BREAKPOINT_PX;
  // from md the sheet is the side panel, which the padding's left already clears
  const covers = document.querySelectorAll(
    phone
      ? "[data-map-card], [data-sheet]:not([data-phone-hidden])"
      : "[data-map-card]",
  );
  return cardPadding({
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    // the canvas fills the window, so page and map coordinates agree
    coverTop: Math.min(
      canvas.clientHeight,
      ...Array.from(covers, (el) => el.getBoundingClientRect().top),
    ),
    safe: safeInsets(),
  });
};
/** Whether a point already shows in the part of the map the panels leave clear. */
function inClear(map: MapRef, at: LngLat) {
  const pad = paddingOf(map);
  const canvas = map.getCanvas();
  const { x, y } = map.project(at);
  return (
    x >= pad.left &&
    x <= canvas.clientWidth - pad.right &&
    y >= pad.top &&
    y <= canvas.clientHeight - pad.bottom
  );
}
