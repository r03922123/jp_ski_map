import { type RefObject, useEffect, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

/** How long the phone's compact credits stay open after the map loads. */
const CREDITS_SHOWN_MS = 5000;

/**
 * Phones: the compact credits show on first display, then fold after five seconds, as
 * OSM's attribution guidelines allow; the ⓘ reopens them. After that a new trip
 * (`tripKey`) folds them again, as MapLibre's first drag does: open, they sit on the
 * strip above the sheet that the fit keeps for the end markers.
 */
export function useCompactCredits(
  mapRef: RefObject<MapRef | null>,
  mapReady: boolean,
  tripKey: string,
) {
  const [creditsShown, setCreditsShown] = useState(false);
  const foldCredits = () =>
    mapRef.current
      ?.getContainer()
      .querySelector(".maplibregl-compact-show")
      ?.classList.remove("maplibregl-compact-show");
  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(() => setCreditsShown(true), CREDITS_SHOWN_MS);
    return () => clearTimeout(t);
  }, [mapReady]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tripKey stands for the trip
  useEffect(() => {
    if (creditsShown) foldCredits();
  }, [tripKey, creditsShown]);
}
