import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  errorFrom,
  geolocationSource,
  simulatedSource,
  toFix,
} from "@/lib/nav/position";
import type { Fix } from "@/lib/nav/project";
import { distanceM, type LngLat } from "@/lib/route-geo";
import { useWakeLock } from "@/lib/wake-lock";

const LINE: LngLat[] = [
  [137.85, 36.7],
  [137.86, 36.7], // ~893 m east
];

describe("toFix / errorFrom", () => {
  it("maps a browser position, treating NaN speed and heading as unknown", () => {
    const fix = toFix({
      coords: {
        latitude: 36.7,
        longitude: 137.85,
        accuracy: 8,
        speed: Number.NaN,
        heading: null,
        altitude: null,
        altitudeAccuracy: null,
      },
      timestamp: 1000,
    } as unknown as GeolocationPosition);
    expect(fix).toEqual({
      lat: 36.7,
      lng: 137.85,
      accuracyM: 8,
      speedMps: null,
      headingDeg: null,
      t: 1000,
    });
  });

  it("names permission and availability errors", () => {
    expect(errorFrom(1)).toBe("denied");
    expect(errorFrom(2)).toBe("unavailable");
    expect(errorFrom(3)).toBe("unavailable");
  });
});

describe("geolocationSource", () => {
  it("refuses outside a secure context, before asking for permission", () => {
    const watchPosition = vi.fn();
    const onError = vi.fn();
    geolocationSource({ geo: { watchPosition } as never, secure: false }).start(
      vi.fn(),
      onError,
    );
    expect(onError).toHaveBeenCalledWith("insecure");
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it("reports browsers without geolocation", () => {
    const onError = vi.fn();
    geolocationSource({ geo: undefined, secure: true }).start(vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith("unsupported");
  });

  it("watches with high accuracy and clears the watch on stop", () => {
    const clearWatch = vi.fn();
    const watchPosition = vi.fn().mockReturnValue(7);
    const stop = geolocationSource({
      geo: { watchPosition, clearWatch } as never,
      secure: true,
    }).start(vi.fn(), vi.fn());
    expect(watchPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
    });
    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
});

describe("simulatedSource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("moves along the route at the given speed, facing along it, and stops at the end", () => {
    const fixes: Fix[] = [];
    const stop = simulatedSource(LINE, 100, { tickMs: 1000 }).start(
      (f) => fixes.push(f),
      vi.fn(),
    );
    vi.advanceTimersByTime(3000);
    expect(fixes).toHaveLength(3);
    const moved = distanceM(LINE[0], [fixes[2].lng, fixes[2].lat]);
    expect(moved).toBeCloseTo(300, -1);
    expect(fixes[2].headingDeg).toBeCloseTo(90, 0);
    expect(fixes[2].speedMps).toBe(100);

    vi.advanceTimersByTime(20_000);
    const last = fixes[fixes.length - 1];
    expect(distanceM(LINE[1], [last.lng, last.lat])).toBeLessThan(1);
    const count = fixes.length;
    vi.advanceTimersByTime(5000);
    expect(fixes).toHaveLength(count); // finished: no more fixes
    stop();
  });
});

describe("useWakeLock", () => {
  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup of a browser API stub
    delete (navigator as any).wakeLock;
  });

  it("holds the screen awake while active and releases it after", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    Object.defineProperty(navigator, "wakeLock", {
      value: { request },
      configurable: true,
    });
    const { rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    });
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
    rerender({ on: false });
    await act(async () => {});
    expect(release).toHaveBeenCalled();
  });

  it("says when the browser can't keep the screen on", () => {
    const { result } = renderHook(() => useWakeLock(true));
    expect(result.current.supported).toBe(false);
  });
});
