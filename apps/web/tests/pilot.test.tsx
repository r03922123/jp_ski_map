import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
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

  // Live iPhone QA (2026-11-02): "Finding your location…" sat for 12 s while Safari's
  // permission prompt waited for a tap, with no hint. After a short wait, say so.
  it("while waiting for a first fix, a hint to allow location appears after a few seconds", () => {
    vi.useFakeTimers();
    try {
      const m = manualSource();
      const { result } = renderHook(() => usePilot(walk, m.source));
      render(<PilotView {...base} status={result.current} />);
      const banner = screen.getByRole("region", { name: "Next turn" });
      expect(banner).toHaveTextContent("Finding your location…");
      expect(banner).not.toHaveTextContent(/allow/i);
      act(() => vi.advanceTimersByTime(4500));
      expect(banner).toHaveTextContent(/tap allow/i);
    } finally {
      vi.useRealTimers();
    }
  });

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

describe("PilotView rerouting", () => {
  const props = {
    mode: "walk" as const,
    following: true,
    onExit: vi.fn(),
    onRecenter: vi.fn(),
    now: new Date("2027-01-15T08:00:00+09:00"),
  };

  it("says Rerouting… while a new route is on its way, and when it can't", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[10]);
    for (let i = 1; i <= 12; i++)
      m.fix([coords[10][0], coords[10][1] + 0.002 * i]);
    expect(result.current.phase).toBe("offRoute");
    const { rerender } = render(
      <PilotView {...props} status={result.current} reroute="rerouting" />,
    );
    expect(screen.getByRole("region", { name: "Next turn" })).toHaveTextContent(
      "Rerouting…",
    );
    rerender(<PilotView {...props} status={result.current} reroute="failed" />);
    expect(screen.getByRole("region", { name: "Next turn" })).toHaveTextContent(
      "Can't reroute — continue to the blue line",
    );
  });
});

describe("PilotView voice toggle", () => {
  it("shows mute state and toggles it", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[0]);
    const onToggleMute = vi.fn();
    const props = {
      mode: "walk" as const,
      following: true,
      onExit: vi.fn(),
      onRecenter: vi.fn(),
      now: new Date(),
      status: result.current,
      onToggleMute,
    };
    const { rerender } = render(<PilotView {...props} muted={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mute voice" }));
    expect(onToggleMute).toHaveBeenCalled();
    rerender(<PilotView {...props} muted />);
    expect(
      screen.getByRole("button", { name: "Unmute voice" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PilotView on the walk to a bus stop", () => {
  it("shows the bus's stops under the footnote", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[0]);
    render(
      <PilotView
        mode="walk"
        following
        onExit={vi.fn()}
        onRecenter={vi.fn()}
        now={new Date()}
        status={result.current}
        footnote="Then Line V from Terminal at 08:11"
        busStops={[
          { stopId: "a", name: "Terminal", time: "08:11" },
          { stopId: "b", name: "Echo", time: null },
          { stopId: "c", name: "Resort", time: "08:20" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Bus stops" });
    expect(list).toHaveTextContent("Terminal08:11");
    expect(list).toHaveTextContent("Echotime not published");
    expect(list).toHaveTextContent("Resort08:20");
  });
});

describe("StopList keeps the next stop in view", () => {
  it("scrolls the current row into view when the next stop changes", async () => {
    const { StopList } = await import("@/components/StopList");
    const spy = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    const stops = Array.from({ length: 8 }, (_, i) => ({
      stopId: `s${i}`,
      name: `Stop ${i}`,
      time: null,
    }));
    const { rerender } = render(<StopList stops={stops} nextIndex={1} />);
    spy.mockClear();
    rerender(<StopList stops={stops} nextIndex={5} />);
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    expect(spy.mock.contexts.at(-1)).toHaveAttribute("aria-current", "step");
    expect(spy.mock.contexts.at(-1)).toHaveTextContent("Stop 5");
    Element.prototype.scrollIntoView = original;
  });

  it("lists all of a long walk-leg bus (no cap)", () => {
    const m = manualSource();
    const { result } = renderHook(() => usePilot(walk, m.source));
    m.fix(coords[0]);
    const stops = Array.from({ length: 7 }, (_, i) => ({
      stopId: `s${i}`,
      name: `Stop ${i}`,
      time: null,
    }));
    render(
      <PilotView
        mode="walk"
        following
        onExit={vi.fn()}
        onRecenter={vi.fn()}
        now={new Date()}
        status={result.current}
        busStops={stops}
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "Bus stops" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(7);
  });
});
