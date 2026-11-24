import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resort, Route } from "@/lib/api";
import { MAP_STYLE_URL } from "@/lib/map-config";
import type { Camera } from "@/lib/nav/camera";
import type { LngLat } from "@/lib/route-geo";
import type { SavedMarker } from "@/lib/saved-places";
import walkFixture from "./fixtures/route-walk.json";

// Task 67: under load the pilot drag sometimes did nothing. The follow camera's ease was
// scheduled in an effect; a press that landed after React committed but before that
// effect ran made React flush it first, with the old "not pressing" value, so the ease
// started inside the press and MapLibre's easeTo cancelled the drag. The mock map below
// presses in that exact window (its layout effect runs at commit, before passive effects).
const h = vi.hoisted(() => ({
  props: {} as Record<string, (...a: unknown[]) => void>,
  pressOnNextCommit: false,
  map: {
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: () => 14,
    project: () => ({ x: 200, y: 400 }),
    getCanvas: () => ({ clientHeight: 800, clientWidth: 400 }),
    getBounds: () => ({
      getSouth: () => 36.6,
      getWest: () => 137.8,
      getNorth: () => 36.8,
      getEast: () => 137.9,
    }),
  },
}));

vi.mock("maplibre-gl", () => ({ setWorkerUrl: () => {} }));
vi.mock("react-map-gl/maplibre", async () => {
  const React = await import("react");
  const MapGL = React.forwardRef(function MapGL(
    p: Record<string, unknown> & { children?: ReactNode },
    ref,
  ) {
    h.props = p as typeof h.props;
    React.useImperativeHandle(ref, () => h.map);
    React.useLayoutEffect(() => {
      if (!h.pressOnNextCommit) return;
      h.pressOnNextCommit = false;
      (p.onMouseDown as () => void)?.();
    });
    return <div>{p.children}</div>;
  });
  const Nothing = () => null;
  const Marker = (p: { onClick?: (e: unknown) => void }) =>
    p.onClick ? (
      <button
        type="button"
        data-marker
        onClick={() =>
          p.onClick?.({ originalEvent: { stopPropagation: () => {} } })
        }
      />
    ) : null;
  return {
    __esModule: true,
    default: MapGL,
    Layer: Nothing,
    Marker,
    NavigationControl: Nothing,
    Source: Nothing,
  };
});

const { default: MapView } = await import("@/components/MapView");

const RESORT = {
  id: "happo-one",
  name: { en: "Hakuba Happo-One", ja: "白馬八方尾根" },
  accessPoints: [{ coord: { lat: 36.69, lng: 137.83 } }],
} as unknown as Resort;
const SAVED = {
  id: "s1",
  coord: { lat: 36.7, lng: 137.84 },
  name: "Hotel",
  icon: "hotel",
} as unknown as SavedMarker;

const cam = (lng: number): Camera => ({
  center: [lng, 36.7],
  bearing: 0,
  pitch: 45,
  zoom: 16,
});

function view(
  camera: Camera | null,
  onPickOrigin: (c: { lat: number; lng: number }) => void = () => {},
  markers: {
    onSelectResort?: (id: string) => void;
    onSelectSaved?: (id: string) => void;
  } = {},
  extra: Partial<Parameters<typeof MapView>[0]> = {},
) {
  return (
    <MapView
      resorts={markers.onSelectResort ? [RESORT] : []}
      selectedResortId={null}
      origin={null}
      destination={null}
      routes={[]}
      activeRoute={0}
      lodging={[]}
      busStop={null}
      ride={null}
      flyTo={null}
      onPickOrigin={onPickOrigin}
      onSelectResort={markers.onSelectResort ?? (() => {})}
      saved={markers.onSelectSaved ? [SAVED] : []}
      onSelectSaved={markers.onSelectSaved}
      pilot={
        camera && {
          camera,
          puck: camera.center,
          heading: 0,
          covered: [],
          following: true,
          onUserMove: () => {},
          pose: "walk",
        }
      }
      {...extra}
    />
  );
}

describe("MapView basemap (SPEC-web-app v1.30)", () => {
  it("hands MapLibre the plain style URL on the first render", () => {
    render(view(null));
    expect(h.props.mapStyle).toBe(MAP_STYLE_URL);
  });
});

describe("MapView follow camera (Task 67)", () => {
  beforeEach(() => {
    // jsdom has no matchMedia (prefersReducedMotion reads it)
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    h.map.easeTo.mockClear();
    h.pressOnNextCommit = false;
  });

  it("follows each new camera when nothing is pressed", () => {
    const { rerender } = render(view(cam(137.85)));
    act(() => h.props.onLoad({ target: h.map }));
    expect(h.map.easeTo).toHaveBeenCalledTimes(1);
    rerender(view(cam(137.86)));
    expect(h.map.easeTo).toHaveBeenCalledTimes(2);
  });

  it("a press that lands before the new camera's effect ran does not ease mid-press", () => {
    const { rerender } = render(view(cam(137.85)));
    act(() => h.props.onLoad({ target: h.map }));
    h.map.easeTo.mockClear();

    h.pressOnNextCommit = true;
    rerender(view(cam(137.86))); // a GPS fix commits; the finger goes down right then
    expect(h.map.easeTo).not.toHaveBeenCalled();

    // released without dragging: the camera catches up
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(h.map.easeTo).toHaveBeenCalledTimes(1);
    expect(h.map.easeTo.mock.calls[0][0]).toMatchObject({
      center: [137.86, 36.7],
    });
  });
});

// iPhone QA (2026-11-02): a tap on the map during navigation or its preview dropped a
// new start, which replaced the trip being followed. Taps pick a start only when
// planning, never while the pilot owns the map.
describe("MapView taps while navigating", () => {
  const tap = () =>
    h.props.onClick({
      features: [],
      lngLat: { lat: 36.7, lng: 137.85 },
      originalEvent: { detail: 1 },
    });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("planning, mouse: a click sets the start (after the double-click window)", () => {
    const pick = vi.fn();
    render(view(null, pick));
    act(() => tap());
    act(() => vi.advanceTimersByTime(400));
    expect(pick).toHaveBeenCalledWith({ lat: 36.7, lng: 137.85 });
  });

  it("navigating or previewing: a tap drops nothing", () => {
    const pick = vi.fn();
    render(view(cam(137.85), pick));
    act(() => tap());
    act(() => vi.advanceTimersByTime(400));
    expect(pick).not.toHaveBeenCalled();
  });

  it("navigating or previewing: a resort or saved-place marker changes nothing", () => {
    const resort = vi.fn();
    const saved = vi.fn();
    render(
      view(cam(137.85), () => {}, {
        onSelectResort: resort,
        onSelectSaved: saved,
      }),
    );
    for (const m of document.querySelectorAll("[data-marker]"))
      fireEvent.click(m);
    expect(resort).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });

  it("planning: the same markers still choose the resort / saved place", () => {
    const resort = vi.fn();
    const saved = vi.fn();
    render(
      view(null, () => {}, { onSelectResort: resort, onSelectSaved: saved }),
    );
    for (const m of document.querySelectorAll("[data-marker]"))
      fireEvent.click(m);
    expect(resort).toHaveBeenCalledWith("happo-one");
    expect(saved).toHaveBeenCalledWith("s1");
  });
});

// Cluster A (docs/ux/2026-11-03-ux-review.md): one tap on the phone map replaced the start
// with "Dropped pin", with no undo. Google Maps (BC-A1, docs/ux/behaviour-cards.md): a tap
// on the map changes nothing; a long-press drops a pin with a card, and only a button on
// the card edits the trip. Hold time and slop are the platform defaults: UIKit's long
// press (0.5 s, 10 pt allowable movement), Android's long-press timeout (400–500 ms).
describe("MapView touch: a tap looks, a long-press drops a pin", () => {
  const at = { lat: 36.7, lng: 137.85 };
  const touch = (name: string, x = 100, y = 100, fingers = 1) =>
    h.props[name]({
      point: { x, y },
      points: Array.from({ length: fingers }, () => ({ x, y })),
      lngLat: at,
      originalEvent: {},
    });
  const click = (features: unknown[] = []) =>
    h.props.onClick({ features, lngLat: at, originalEvent: { detail: 1 } });
  const tapMap = (features: unknown[] = []) => {
    touch("onTouchStart");
    touch("onTouchEnd");
    click(features);
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a tap on empty map keeps the start: nothing is picked, an open card closes", () => {
    const pick = vi.fn();
    const drop = vi.fn();
    const mapTap = vi.fn();
    render(view(null, pick, {}, { onDropPin: drop, onMapTap: mapTap }));
    act(() => tapMap());
    act(() => vi.advanceTimersByTime(800));
    expect(pick).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
    expect(mapTap).toHaveBeenCalledTimes(1);
  });

  it("a long-press drops a pin there; its own lift-off click closes nothing", () => {
    const pick = vi.fn();
    const drop = vi.fn();
    const mapTap = vi.fn();
    render(view(null, pick, {}, { onDropPin: drop, onMapTap: mapTap }));
    act(() => touch("onTouchStart"));
    act(() => vi.advanceTimersByTime(499));
    expect(drop).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(drop).toHaveBeenCalledWith(at, null);
    act(() => {
      touch("onTouchEnd");
      click();
    });
    act(() => vi.advanceTimersByTime(800));
    expect(pick).not.toHaveBeenCalled();
    expect(mapTap).not.toHaveBeenCalled();
  });

  it("a pan (finger moves past 10 px), a pinch (two fingers) or an early lift drops nothing", () => {
    const drop = vi.fn();
    render(view(null, () => {}, {}, { onDropPin: drop }));
    act(() => {
      touch("onTouchStart");
      touch("onTouchMove", 100, 111);
    });
    act(() => vi.advanceTimersByTime(800));
    act(() => touch("onTouchStart", 100, 100, 2));
    act(() => vi.advanceTimersByTime(800));
    act(() => {
      touch("onTouchStart");
      touch("onTouchEnd");
    });
    act(() => vi.advanceTimersByTime(800));
    expect(drop).not.toHaveBeenCalled();
  });

  it("a finger that wobbles within 10 px still counts as a press", () => {
    const drop = vi.fn();
    render(view(null, () => {}, {}, { onDropPin: drop }));
    act(() => {
      touch("onTouchStart");
      touch("onTouchMove", 106, 104);
    });
    act(() => vi.advanceTimersByTime(500));
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("a tap on a hotel pin opens that hotel's card, named", () => {
    const pick = vi.fn();
    const drop = vi.fn();
    render(view(null, pick, {}, { onDropPin: drop }));
    act(() =>
      tapMap([
        {
          layer: { id: "lodging-pins" },
          geometry: { type: "Point", coordinates: [137.86, 36.71] },
          properties: { name: "Hotel Hakuba" },
        },
      ]),
    );
    act(() => vi.advanceTimersByTime(800));
    expect(drop).toHaveBeenCalledWith(
      { lat: 36.71, lng: 137.86 },
      "Hotel Hakuba",
    );
    expect(pick).not.toHaveBeenCalled();
  });

  // S4 (journey matrix): a long-press that lands on a hotel pin is about that hotel
  it("a long-press on a hotel pin drops the pin at the hotel, named", () => {
    const drop = vi.fn();
    render(view(null, () => {}, {}, { onDropPin: drop }));
    act(() =>
      h.props.onTouchStart({
        point: { x: 100, y: 100 },
        points: [{ x: 100, y: 100 }],
        lngLat: at,
        originalEvent: {},
        features: [
          {
            layer: { id: "lodging-pins" },
            geometry: { type: "Point", coordinates: [137.86, 36.71] },
            properties: { name: "Hotel Hakuba" },
          },
        ],
      }),
    );
    act(() => vi.advanceTimersByTime(500));
    expect(drop).toHaveBeenCalledWith(
      { lat: 36.71, lng: 137.86 },
      "Hotel Hakuba",
    );
  });

  // SPEC-ski-runs v1.1: a run or lift says what it is, by finger or mouse
  const LIFT = {
    layer: { id: "ski-lines-hit" },
    geometry: { type: "LineString", coordinates: [] },
    properties: {
      id: "l1",
      kind: "lift",
      name: "Alpen Quad",
      liftType: "chair_lift",
      resortId: "happo-one",
    },
  };
  it("a tap or click on a run or lift opens its card and picks nothing", () => {
    const pick = vi.fn();
    const line = vi.fn();
    render(
      view(null, pick, {}, { onDropPin: () => {}, onSelectSkiLine: line }),
    );
    act(() => tapMap([LIFT]));
    act(() => click([LIFT]));
    act(() => vi.advanceTimersByTime(800));
    expect(line).toHaveBeenCalledTimes(2);
    expect(line).toHaveBeenCalledWith({
      id: "l1",
      kind: "lift",
      name: "Alpen Quad",
      difficulty: null,
      liftType: "chair_lift",
      resortId: "happo-one",
      distanceM: null,
      minElevationM: null,
      maxElevationM: null,
      slopePct: null,
      durationS: null,
    });
    expect(pick).not.toHaveBeenCalled();
  });

  // a mouse double-click zooms; in a resort most land on a run's 16 px band
  it("a mouse double-click on a run zooms and opens no card", () => {
    const line = vi.fn();
    render(view(null, () => {}, {}, { onSelectSkiLine: line }));
    act(() => click([LIFT]));
    act(() =>
      h.props.onClick({
        features: [LIFT],
        lngLat: at,
        originalEvent: { detail: 2 },
      }),
    );
    act(() => vi.advanceTimersByTime(800));
    expect(line).not.toHaveBeenCalled();
  });

  it("a long-press on a run drops a pin; its lift-off opens no run card", () => {
    const drop = vi.fn();
    const line = vi.fn();
    render(
      view(null, () => {}, {}, { onDropPin: drop, onSelectSkiLine: line }),
    );
    act(() => touch("onTouchStart"));
    act(() => vi.advanceTimersByTime(500));
    act(() => {
      touch("onTouchEnd");
      click([LIFT]);
    });
    expect(drop).toHaveBeenCalledTimes(1);
    expect(line).not.toHaveBeenCalled();
  });

  it("an open stop box takes a tap on a run as the stop's point", () => {
    const pick = vi.fn();
    const line = vi.fn();
    render(view(null, pick, {}, { placingStop: true, onSelectSkiLine: line }));
    act(() => click([LIFT]));
    act(() => vi.advanceTimersByTime(400));
    expect(line).not.toHaveBeenCalled();
    expect(pick).toHaveBeenCalledWith(at);
  });

  it("an open stop box still takes a tap: the user asked for a point", () => {
    const pick = vi.fn();
    render(view(null, pick, {}, { placingStop: true, onDropPin: () => {} }));
    act(() => tapMap());
    act(() => vi.advanceTimersByTime(400));
    expect(pick).toHaveBeenCalledWith(at);
  });

  it("navigating or previewing: a long-press drops nothing", () => {
    const drop = vi.fn();
    render(view(cam(137.85), () => {}, {}, { onDropPin: drop }));
    act(() => touch("onTouchStart"));
    act(() => vi.advanceTimersByTime(800));
    expect(drop).not.toHaveBeenCalled();
  });

  // v1.9 (found by e2e): the top trip card covers the map's top edge, so a pin dropped
  // there opened its card underneath it. Google eases the camera to a dropped pin (BC-A1);
  // ours does too, once the finger is up (an ease inside a press cancels gestures, T67)
  it("a dropped pin brings the camera to it, clear of the top card and the sheet, after the finger lifts", () => {
    h.map.easeTo.mockClear();
    const extra = { droppedPin: { coord: at, name: null } };
    const { rerender } = render(view(null, () => {}, {}, {}));
    act(() => h.props.onLoad({ target: h.map }));
    act(() => touch("onTouchStart"));
    rerender(view(null, () => {}, {}, extra));
    expect(h.map.easeTo).not.toHaveBeenCalled(); // finger still down
    act(() => {
      window.dispatchEvent(new Event("touchend"));
    });
    expect(h.map.easeTo).toHaveBeenCalledTimes(1);
    const [opts] = h.map.easeTo.mock.calls[0] as [
      { center: [number, number]; padding: { top: number; bottom: number } },
    ];
    expect(opts.center).toEqual([at.lng, at.lat]);
    expect(opts.padding.top).toBeGreaterThanOrEqual(120); // the trip card
    expect(opts.padding.bottom).toBeGreaterThanOrEqual(0.4 * 800); // the sheet
    // the same pin doesn't pull the camera again on later renders
    rerender(
      view(null, () => {}, {}, { droppedPin: { coord: at, name: "x" } }),
    );
    expect(h.map.easeTo).toHaveBeenCalledTimes(1);
  });
});

// SPEC-ski-runs v1.5: a picked run, lift or resort is framed clear of its card
describe("MapView frames a picked run or resort", () => {
  const RUN = {
    key: "r1",
    bounds: [
      [137.8, 36.7],
      [137.81, 36.71],
    ] as [LngLat, LngLat],
  };
  const RESORT_LINES = {
    key: "resort:happo-one",
    bounds: [
      [137.79, 36.69],
      [137.83, 36.72],
    ] as [LngLat, LngLat],
  };
  const walk = walkFixture as unknown as Route;
  const fits = () =>
    h.map.fitBounds.mock.calls as [
      [LngLat, LngLat],
      {
        padding: { top: number; bottom: number };
        absolutePadding?: boolean;
        maxZoom?: number;
      },
    ][];
  // something on the page at this top edge, as a card or the sheet would be
  const cover = (attr: string, top: number) => {
    const el = document.createElement("div");
    el.setAttribute(attr, "");
    el.getBoundingClientRect = () => ({ top }) as DOMRect;
    document.body.append(el);
    return el;
  };

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    h.map.fitBounds.mockClear();
  });
  afterEach(() => {
    for (const el of document.querySelectorAll("[data-map-card], [data-sheet]"))
      el.remove();
  });

  it("fits a tapped run's whole line once, above its card, after the finger lifts", () => {
    cover("data-map-card", 500); // the card's top edge on the 400 x 800 map
    const { rerender } = render(view(null));
    act(() => h.props.onLoad({ target: h.map }));
    act(() => h.props.onMouseDown());
    rerender(view(null, () => {}, {}, { skiFocus: RUN }));
    expect(h.map.fitBounds).not.toHaveBeenCalled(); // the button is still down
    act(() => {
      window.dispatchEvent(new Event("mouseup"));
    });
    expect(fits()).toHaveLength(1);
    const [bounds, opts] = fits()[0];
    expect(bounds).toEqual(RUN.bounds);
    expect(opts).toMatchObject({ absolutePadding: true, maxZoom: 16 });
    expect(opts.padding.bottom).toBeGreaterThanOrEqual(800 - 500);
    expect(opts.padding.top).toBeGreaterThanOrEqual(118); // the trip card
    // later renders of the same pick leave the map where the user takes it
    rerender(view(null, () => {}, {}, { skiFocus: { ...RUN } }));
    expect(fits()).toHaveLength(1);
    // a resort card frames all its lines
    rerender(view(null, () => {}, {}, { skiFocus: RESORT_LINES }));
    expect(fits()).toHaveLength(2);
    expect(fits()[1][0]).toEqual(RESORT_LINES.bounds);
  });

  it("on a phone, keeps clear of the sheet when it stands above the card", () => {
    cover("data-map-card", 600);
    cover("data-sheet", 450);
    render(view(null, () => {}, {}, { skiFocus: RUN }));
    act(() => h.props.onLoad({ target: h.map }));
    expect(fits()[0][1].padding.bottom).toBeGreaterThanOrEqual(800 - 450);
  });

  it("the route fit waits while a ski card is open, then fits the route on close", () => {
    cover("data-map-card", 500);
    const route = { routes: [walk], origin: { lat: 36.69, lng: 137.85 } };
    const { rerender } = render(
      view(null, () => {}, {}, { ...route, skiFocus: RUN }),
    );
    act(() => h.props.onLoad({ target: h.map }));
    expect(fits()).toHaveLength(1);
    expect(fits()[0][0]).toEqual(RUN.bounds);
    rerender(view(null, () => {}, {}, { ...route, skiFocus: null }));
    expect(fits()).toHaveLength(2);
    expect(fits()[1][0]).not.toEqual(RUN.bounds);
  });
});
