import { act, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Resort } from "@/lib/api";
import type { Camera } from "@/lib/nav/camera";
import type { SavedMarker } from "@/lib/saved-places";

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
vi.mock("@/lib/game/use-game-style", () => ({ useGameStyle: () => ({}) }));
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
    />
  );
}

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

  it("planning: a tap sets the start (after the double-click window)", () => {
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
