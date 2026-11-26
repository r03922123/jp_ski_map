import { useEffect, useState } from "react";
import { mirrorUrl } from "@/lib/back-close";
import { hotelOf, savedStore } from "@/lib/saved-places";
import { readImportHash } from "@/lib/saved-share";
import {
  parseViewState,
  type RankOptions,
  serializeViewState,
} from "@/lib/url-state";
import type { Trip } from "@/lib/use-trip";

/**
 * The link holds the trip: restore it once on load (or start from My hotel), then mirror
 * every change back into the URL. Returns whether the link has been read.
 */
export function useViewUrl({
  trip,
  rankOptions,
  setRankOptions,
  setImportCode,
}: {
  trip: Trip;
  rankOptions: RankOptions;
  setRankOptions: (rank: RankOptions) => void;
  /** a shared list in the fragment (`#import=…`) waiting to be confirmed */
  setImportCode: (code: string | null) => void;
}) {
  const { origin, mode, selectedResortId, point, filledStops, stopsKey } = trip;
  // `ready` is state (not a ref) so the first URL write happens on a render that
  // already holds the restored values; with a ref, StrictMode's double-mount
  // would overwrite the shared URL with defaults before it is read again.
  const [ready, setReady] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on load
  useEffect(() => {
    const view = parseViewState(window.location.search);
    trip.restore(view, hotelOf(savedStore.getSnapshot()));
    setImportCode(readImportHash(window.location.hash));
    setRankOptions(view.rank);
    setReady(true);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: stopsKey stands for the stops' content
  useEffect(() => {
    if (!ready) return;
    const search = serializeViewState({
      origin,
      mode,
      resortId: selectedResortId,
      rank: rankOptions,
      point: point?.coord ?? null,
      stops: filledStops.map((s) => s.coord),
    });
    mirrorUrl(search);
  }, [ready, origin, mode, selectedResortId, rankOptions, point, stopsKey]);
  return ready;
}
