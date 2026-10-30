import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Coord, Route } from "@/lib/api";
import type { Fix } from "@/lib/nav/project";
import { REROUTE_MIN_INTERVAL_MS, useReroute } from "@/lib/nav/use-reroute";
import walkFixture from "./fixtures/route-walk.json";

const walk = walkFixture as unknown as Route;
const TARGET: Coord = { lat: 36.69877, lng: 137.86197 };
const fixAt = (t: number): Fix => ({
  lat: 36.7,
  lng: 137.85,
  accuracyM: 5,
  speedMps: 1.2,
  headingDeg: null,
  t,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useReroute", () => {
  it("asks for a route from the current fix to the same destination once off route", async () => {
    const fetchRoute = vi.fn().mockResolvedValue(walk);
    const onNewRoute = vi.fn();
    const { result, rerender } = renderHook(
      ({ phase, fix }) =>
        useReroute({
          phase,
          fix,
          mode: "walk",
          target: TARGET,
          fetchRoute,
          onNewRoute,
          onFailure: vi.fn(),
        }),
      {
        initialProps: { phase: "following" as const, fix: fixAt(1) } as {
          phase: "following" | "offRoute";
          fix: Fix;
        },
      },
    );
    expect(fetchRoute).not.toHaveBeenCalled();

    rerender({ phase: "offRoute", fix: fixAt(2) });
    expect(result.current).toBe("rerouting");
    await act(async () => {});
    expect(fetchRoute).toHaveBeenCalledWith(
      "walk",
      { lat: 36.7, lng: 137.85 },
      TARGET,
    );
    expect(onNewRoute).toHaveBeenCalledWith(walk);
    expect(result.current).toBe("idle");
  });

  it("waits 10 s between attempts", async () => {
    const fetchRoute = vi.fn().mockResolvedValue(walk);
    const props = {
      mode: "walk" as const,
      target: TARGET,
      fetchRoute,
      onNewRoute: vi.fn(),
      onFailure: vi.fn(),
    };
    const { rerender } = renderHook(
      (p: { phase: "following" | "offRoute"; fix: Fix }) =>
        useReroute({ ...props, ...p }),
      {
        initialProps: { phase: "offRoute", fix: fixAt(1) },
      },
    );
    await act(async () => {});
    rerender({ phase: "following", fix: fixAt(2) });
    rerender({ phase: "offRoute", fix: fixAt(3) }); // off again right away
    await act(async () => {});
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(REROUTE_MIN_INTERVAL_MS);
    });
    expect(fetchRoute).toHaveBeenCalledTimes(2);
  });

  it("keeps the old route and says so when rerouting fails", async () => {
    const fetchRoute = vi.fn().mockRejectedValue(new Error("offline"));
    const onFailure = vi.fn();
    const { result } = renderHook(() =>
      useReroute({
        phase: "offRoute",
        fix: fixAt(1),
        mode: "walk",
        target: TARGET,
        fetchRoute,
        onNewRoute: vi.fn(),
        onFailure,
      }),
    );
    await act(async () => {});
    expect(result.current).toBe("failed");
    expect(onFailure).toHaveBeenCalled();
  });
});
