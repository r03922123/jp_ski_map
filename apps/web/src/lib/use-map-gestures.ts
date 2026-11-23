import type { MapGeoJSONFeature } from "maplibre-gl";
import { useEffect, useRef } from "react";
import type { MapLayerMouseEvent, MapTouchEvent } from "react-map-gl/maplibre";
import { ALT_HIT_LAYER } from "@/components/map/AlternateRoutes";
import { LODGING_LAYER } from "@/components/map/LodgingLayer";
import { SKI_HIT_LAYER } from "@/components/map/SkiLinesLayer";
import { type SkiLine, skiLineFrom } from "@/components/SkiLineCard";
import type { Coord } from "@/lib/api";

// MapLibre's own double-click needs both clicks well inside this; OSes default to ~500 ms,
// but a longer wait makes every single pick feel late
const DOUBLE_CLICK_MS = 300;
/** Touch long-press: UIKit's default hold (0.5 s) and allowable movement (10 pt). */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
/** A click this soon after a touch ended was made by that finger (the mouse never touches). */
const TOUCH_CLICK_MS = 700;

/**
 * What a click, double-click, tap or long-press on the map means (MapView's props of the
 * same names): pick the start, select a route, drop a pin, or nothing.
 */
export function useMapGestures({
  piloting,
  placingStop,
  onSelectRoute,
  onPickOrigin,
  onDropPin,
  onMapTap,
  onSelectSkiLine,
}: {
  piloting: boolean;
  placingStop: boolean;
  onSelectRoute?: (index: number) => void;
  onPickOrigin: (coord: Coord) => void;
  onDropPin?: (coord: Coord, name: string | null) => void;
  onMapTap?: () => void;
  /** a run or lift was tapped or clicked: its properties and the spot */
  onSelectSkiLine?: (line: SkiLine, at: Coord) => void;
}) {
  // A double-click (double-tap) zooms; its first click must not also move the start.
  // A pick waits out the double-click window, and a second click inside it cancels it.
  const pendingPick = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPick = () => {
    if (pendingPick.current === null) return false;
    clearTimeout(pendingPick.current);
    pendingPick.current = null;
    return true;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: cancelPick only reads a ref
  useEffect(() => () => void cancelPick(), []);

  // Touch long-press, with the platform defaults: UIKit's long press (0.5 s, 10 pt of
  // allowable movement) and Android's long-press timeout. A second finger is a pinch, a
  // finger that travels is a pan; neither drops a pin.
  const hold = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const longPressed = useRef(false); // its lift-off click belongs to the press
  const lastTouch = useRef(0); // a click this soon after a touch came from a finger
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: endHold only reads a ref
  useEffect(() => () => endHold(), []);
  // react-map-gl 8 sets `features` on touch events too (its _onPointerEvent queries
  // the interactive layers for every pointer event); only its types leave it out
  const startHold = (e: MapTouchEvent & { features?: MapGeoJSONFeature[] }) => {
    endHold();
    lastTouch.current = Date.now();
    longPressed.current = false;
    if (e.points.length !== 1 || piloting || !onDropPin) return;
    // pressed on a hotel pin: the card is about that hotel (its spot and name)
    const hotel = e.features?.find((f) => f.layer.id === LODGING_LAYER);
    const geom = hotel?.geometry;
    const coord: Coord =
      geom?.type === "Point"
        ? { lat: geom.coordinates[1], lng: geom.coordinates[0] }
        : { lat: e.lngLat.lat, lng: e.lngLat.lng };
    const name =
      geom?.type === "Point"
        ? ((hotel?.properties?.name as string) ?? null)
        : null;
    hold.current = {
      x: e.point.x,
      y: e.point.y,
      timer: setTimeout(() => {
        hold.current = null;
        longPressed.current = true;
        onDropPin(coord, name);
      }, LONG_PRESS_MS),
    };
  };
  const moveHold = (e: MapTouchEvent) => {
    const h = hold.current;
    if (!h) return;
    if (
      e.points.length !== 1 ||
      Math.hypot(e.point.x - h.x, e.point.y - h.y) > LONG_PRESS_SLOP_PX
    )
      endHold();
  };

  const click = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    // a route line selects that route, unless a stop is being placed: a stop along
    // the way is the likeliest tap then
    if (feature?.layer.id === ALT_HIT_LAYER && !placingStop) {
      onSelectRoute?.(Number(feature.properties?.index));
      return;
    }
    // navigating (or previewing): the pilot owns the map, a tap must not replace
    // the trip being followed with a new start
    if (piloting) return;
    // the click that ends a long-press: the press already dropped its pin
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    // the second click of a double-click: it zooms, nothing is picked
    if (cancelPick() || e.originalEvent.detail > 1) return;
    const byFinger = Date.now() - lastTouch.current < TOUCH_CLICK_MS;
    // a run or lift opens its card, by mouse or finger (SPEC-ski-runs v2); a stop box
    // keeps the tap for its point
    if (
      feature?.layer.id === SKI_HIT_LAYER &&
      onSelectSkiLine &&
      !placingStop
    ) {
      if (byFinger) onMapTap?.(); // the tap left the pin card, as an empty-map tap does
      onSelectSkiLine(skiLineFrom(feature.properties), {
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
      });
      return;
    }
    // a lodging pin snaps the origin onto the hotel itself
    const pin = feature?.geometry;
    const at: Coord =
      pin?.type === "Point"
        ? { lat: pin.coordinates[1], lng: pin.coordinates[0] }
        : { lat: e.lngLat.lat, lng: e.lngLat.lng };
    // a finger looks, it doesn't edit (BC-A1): a hotel pin opens its card, empty map
    // closes one. An open stop box is the exception: the user asked for a point.
    if (byFinger && onDropPin && !placingStop) {
      if (pin?.type === "Point")
        onDropPin(at, (feature?.properties?.name as string) ?? null);
      else onMapTap?.();
      return;
    }
    pendingPick.current = setTimeout(() => {
      pendingPick.current = null;
      onPickOrigin(at);
    }, DOUBLE_CLICK_MS);
  };
  const touchEnd = () => {
    endHold();
    lastTouch.current = Date.now();
  };
  return { startHold, moveHold, endHold, touchEnd, click, cancelPick };
}
