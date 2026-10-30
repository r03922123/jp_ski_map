import { describe, expect, it, vi } from "vitest";
import {
  canReroute,
  FAR_FROM_ROUTE_M,
  isFarFromRoute,
  quietPosition,
} from "@/lib/nav/proximity";

const HOTEL = { lat: 36.69711, lng: 137.85393 };
const TOKYO = { lat: 35.68, lng: 139.76 };

describe("far from the route", () => {
  it("is more than 1 km from the route's start", () => {
    expect(FAR_FROM_ROUTE_M).toBe(1000);
    expect(isFarFromRoute(HOTEL, [137.85393, 36.69711])).toBe(false);
    expect(
      isFarFromRoute({ lat: 36.706, lng: 137.854 }, [137.85393, 36.69711]),
    ).toBe(false); // ~1 km
    expect(
      isFarFromRoute({ lat: 36.71, lng: 137.854 }, [137.85393, 36.69711]),
    ).toBe(true);
    expect(isFarFromRoute(TOKYO, [137.85393, 36.69711])).toBe(true);
  });

  it("never asks for a reroute from more than 50 km from the destination", () => {
    expect(canReroute(HOTEL, { lat: 36.7, lng: 137.84 })).toBe(true);
    expect(canReroute(TOKYO, { lat: 36.7, lng: 137.84 })).toBe(false);
  });
});

describe("quietPosition", () => {
  const geoReturning = (coords: { latitude: number; longitude: number }) => ({
    getCurrentPosition: vi.fn((ok: (p: unknown) => void) => ok({ coords })),
  });

  it("reads the position only when permission is already granted", async () => {
    const geo = geoReturning({ latitude: 35.68, longitude: 139.76 });
    const permissions = {
      query: vi.fn().mockResolvedValue({ state: "granted" }),
    };
    expect(await quietPosition({ geo, permissions } as never)).toEqual(TOKYO);
  });

  it("never prompts: prompt or denied gives unknown without touching geolocation", async () => {
    for (const state of ["prompt", "denied"]) {
      const geo = geoReturning({ latitude: 1, longitude: 2 });
      const permissions = { query: vi.fn().mockResolvedValue({ state }) };
      expect(await quietPosition({ geo, permissions } as never)).toBeNull();
      expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    }
  });

  it("is unknown when the permissions API is missing or throws", async () => {
    const geo = geoReturning({ latitude: 1, longitude: 2 });
    expect(
      await quietPosition({ geo, permissions: undefined } as never),
    ).toBeNull();
    const throwing = { query: vi.fn().mockRejectedValue(new Error("nope")) };
    expect(
      await quietPosition({ geo, permissions: throwing } as never),
    ).toBeNull();
  });
});
