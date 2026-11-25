import { useQuery } from "@tanstack/react-query";
import type { PanelMode } from "@/components/ModePanel";
import type { RankingState } from "@/components/RankingPanel";
import { type Bbox, type Coord, fetchLodging, fetchRank } from "@/lib/api";
import type { RankOptions } from "@/lib/url-state";

const LODGING_MIN_ZOOM = 14;

/** Lodging pins in the map's view, once it is zoomed in far enough to show them. */
export function useLodging(view: { bbox: Bbox; zoom: number } | null) {
  const showLodging = view !== null && view.zoom >= LODGING_MIN_ZOOM;
  const lodging = useQuery({
    queryKey: ["lodging", view?.bbox],
    queryFn: () => fetchLodging(view!.bbox),
    enabled: showLodging,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY, // snapshot data
  });
  return showLodging ? (lodging.data ?? []) : [];
}

/** Walk mode's resort ranking from the start. */
export function useRanking(
  mode: PanelMode,
  origin: Coord | null,
  rankOptions: RankOptions,
) {
  const ranking = useQuery({
    queryKey: ["rank", origin, rankOptions],
    queryFn: () => fetchRank(origin!, rankOptions),
    enabled: mode === "walk" && origin !== null,
    retry: false,
    placeholderData: (previous) => previous, // keep the list while re-sorting
  });
  const rankingState: RankingState = ranking.isPending
    ? { status: "loading" }
    : ranking.isError
      ? { status: "error" }
      : { status: "success", data: ranking.data };

  return { ranking, rankingState };
}
