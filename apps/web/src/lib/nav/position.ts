import type { Fix } from "@/lib/nav/project";
import {
  bearingDeg,
  distanceM,
  type LngLat,
  pointAlong,
} from "@/lib/route-geo";

/**
 * Where GPS fixes come from. The navigator only sees `Fix`es, so the same pilot runs on
 * the phone's GPS, on Playwright's mocked geolocation, or on a simulated drive.
 */

export type PositionError =
  | "denied"
  | "unavailable"
  | "insecure"
  | "unsupported";

export type PositionSource = {
  /** Starts delivering fixes; returns a function that stops them. */
  start(
    onFix: (fix: Fix) => void,
    onError: (error: PositionError) => void,
  ): () => void;
};

const known = (v: number | null) => (v === null || Number.isNaN(v) ? null : v);

export function toFix(p: GeolocationPosition): Fix {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracyM: p.coords.accuracy,
    speedMps: known(p.coords.speed),
    headingDeg: known(p.coords.heading),
    t: p.timestamp,
  };
}

/** GeolocationPositionError codes: 1 permission denied, 2 unavailable, 3 timeout. */
export function errorFrom(code: number): PositionError {
  return code === 1 ? "denied" : "unavailable";
}

export function geolocationSource(
  env: { geo: Geolocation | undefined; secure: boolean } = {
    geo: typeof navigator === "undefined" ? undefined : navigator.geolocation,
    secure: typeof window !== "undefined" && window.isSecureContext,
  },
): PositionSource {
  return {
    start(onFix, onError) {
      // browsers only share location with https pages (localhost excepted)
      if (!env.secure) {
        onError("insecure");
        return () => {};
      }
      if (!env.geo) {
        onError("unsupported");
        return () => {};
      }
      const geo = env.geo;
      const id = geo.watchPosition(
        (p) => onFix(toFix(p)),
        (e) => onError(errorFrom(e.code)),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 20_000 },
      );
      return () => geo.clearWatch(id);
    },
  };
}

/** Dev-only: drives along `coords` at `speedMps`, one fix per tick (watch the pilot on a desk). */
export function simulatedSource(
  coords: LngLat[],
  speedMps: number,
  { tickMs = 1000 }: { tickMs?: number } = {},
): PositionSource {
  const total = coords
    .slice(1)
    .reduce((sum, c, i) => sum + distanceM(coords[i], c), 0);
  return {
    start(onFix) {
      let elapsedS = 0;
      const timer = setInterval(() => {
        elapsedS += tickMs / 1000;
        const fraction =
          total > 0 ? Math.min(1, (speedMps * elapsedS) / total) : 1;
        const at = pointAlong(coords, fraction);
        const ahead = pointAlong(coords, Math.min(1, fraction + 0.001));
        onFix({
          lng: at[0],
          lat: at[1],
          accuracyM: 5,
          speedMps,
          headingDeg: fraction < 1 ? bearingDeg(at, ahead) : null,
          t: Date.now(),
        });
        if (fraction >= 1) clearInterval(timer);
      }, tickMs);
      return () => clearInterval(timer);
    },
  };
}
