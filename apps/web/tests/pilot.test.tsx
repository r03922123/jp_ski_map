import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PilotView } from "@/components/PilotView";
import type { Route } from "@/lib/api";
import type { PositionError, PositionSource } from "@/lib/nav/position";
import type { Fix } from "@/lib/nav/project";
import { splitAt } from "@/lib/nav/project";
import { usePilot } from "@/lib/nav/use-pilot";
import type { LngLat } from "@/lib/route-geo";
import { useHiddenTimeout } from "@/lib/wake-lock";
import walkFixture from "./fixtures/route-walk.json";

const walk = walkFixture as unknown as Route;
const coords = walk.geometry.coordinates as LngLat[];

/** A position source the test drives by hand. */
function manualSource() {
  let emitFix: (f: Fix) => void = () => {};
  let emitError: (e: PositionError) => void = () => {};
  const stop = vi.fn();
  const source: PositionSource = {
    start(onFix, onError) {
      emitFix = onFix;
      emitError = onError;
      return stop;
    },
  };
  const at = (c: LngLat, extra: Partial<Fix> = {}): Fix => ({
    lng: c[0],
    lat: c[1],
    accuracyM: 5,
    speedMps: 1.3,
    headingDeg: null,
    t: Date.now(),
    ...extra,
  });
  return {
    source,
    stop,
    fix: (c: LngLat, extra?: Partial<Fix>) => act(() => emitFix(at(c, extra))),
    fail: (e: PositionError) => act(() => emitError(e)),
  };
}

describe("splitAt", () => {
  it("cuts the line at the projected point into covered and ahead parts", () => {
    const line: LngLat[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const { covered, ahead } = splitAt(line, {
      index: 1,
      t: 0.5,
      point: [1.5, 0],
    });
    expect(covered).toEqual([
      [0, 0],
      [1, 0],
      [1.5, 0],
    ]);
    expect(ahead).toEqual([
      [1.5, 0],
      [2, 0],
    ]);
  });
});

describe("usePilot", () => {
  it("waits for the first fix, then follows with guidance and a camera", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    expect(result.current.phase).toBe("starting");

    m.fix(coords[0]);
    expect(result.current.phase).toBe("following");
    expect(result.current.guidance?.remainingM).toBeGreaterThan(900);
    expect(result.current.guidance?.next?.maneuver).toBe(
      walk.steps[1].maneuver,
    );
    expect(result.current.camera?.pitch).toBe(45);

    m.fix(coords[20]);
    expect(result.current.guidance?.remainingM).toBeLessThan(900);

    m.fix(coords[coords.length - 1]);
    expect(result.current.phase).toBe("arrived");
  });

  it("reports location errors and stops the source on unmount", () => {
    const m = manualSource();
    const { result, unmount } = renderHook(() => usePilot(walk, m.source));
    m.fail("denied");
    expect(result.current.error).toBe("denied");
    unmount();
    expect(m.stop).toHaveBeenCalled();
  });
});

describe("PilotView", () => {
  const base = {
    mode: "walk" as const,
    following: true,
    onExit: vi.fn(),
    onRecenter: vi.fn(),
    now: new Date("2027-01-15T08:00:00+09:00"),
  };

  it("shows the next turn, then the arrival time, time and distance left", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[0]);
    render(<PilotView {...base} status={result.current} />);

    const banner = screen.getByRole("region", { name: "Next turn" });
    expect(banner).toHaveTextContent(walk.steps[1].instruction);
    const bar = screen.getByRole("region", { name: "Trip progress" });
    expect(bar).toHaveTextContent(/08:1\d/); // ~11 min walk from 08:00
    expect(bar).toHaveTextContent("min");
    expect(bar).toHaveTextContent("Live traffic unavailable");
    expect(screen.getByTestId("pilot")).toHaveAttribute(
      "data-nav-phase",
      "following",
    );
  });

  it("offers Re-centre only when the map stopped following", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[0]);
    const { rerender } = render(
      <PilotView {...base} status={result.current} />,
    );
    expect(screen.queryByRole("button", { name: "Re-centre" })).toBeNull();
    rerender(<PilotView {...base} following={false} status={result.current} />);
    fireEvent.click(screen.getByRole("button", { name: "Re-centre" }));
    expect(base.onRecenter).toHaveBeenCalled();
  });

  it("explains a denied location and lets the user leave", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fail("denied");
    render(<PilotView {...base} status={result.current} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/location/i);
    fireEvent.click(screen.getByRole("button", { name: "Exit navigation" }));
    expect(base.onExit).toHaveBeenCalled();
  });

  it("guides to the route before reaching it", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    const [lng, lat] = coords[0];
    m.fix([lng, lat + 0.0003]); // ~33 m north of the route's first point
    expect(result.current.nav.approachM).not.toBeNull();
    render(<PilotView {...base} status={result.current} />);
    expect(screen.getByRole("region", { name: "Next turn" })).toHaveTextContent(
      /Head to the route/,
    );
    expect(
      screen.getByRole("region", { name: "Trip progress" }),
    ).toHaveTextContent("min");
  });

  it("says when you've arrived", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[coords.length - 1]);
    render(<PilotView {...base} status={result.current} />);
    expect(screen.getByText(/You've arrived/)).toBeInTheDocument();
  });
});

describe("useHiddenTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setVisibility(state: "visible" | "hidden") {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("stops after the page has been hidden for the whole timeout, not before", () => {
    const onTimeout = vi.fn();
    renderHook(() => useHiddenTimeout(true, 10 * 60_000, onTimeout));
    setVisibility("hidden");
    vi.advanceTimersByTime(9 * 60_000);
    setVisibility("visible"); // came back in time
    vi.advanceTimersByTime(5 * 60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    setVisibility("hidden");
    vi.advanceTimersByTime(10 * 60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    setVisibility("visible");
  });
});
