import type { PanelMode } from "@/components/ModePanel";
import type { Coord, PoiCategory, SortKey } from "@/lib/api";

export type RankOptions = {
  sort: SortKey;
  maxWalkMin: number | null;
  nightSkiing: boolean;
  hvPass: boolean;
};

/** What the destination list shows: ski resorts, or a kind of nearby place. */
export type DestinationCategory = "resorts" | PoiCategory;

/**
 * The shareable part of the view:
 * `?from=lat,lng&mode=walk&resort=happo-one&sort=…`, or for a place
 * `?from=…&mode=walk&cat=convenience&dest=poi:osm:node/123`, or any point
 * (a saved place's "Go here") `?from=…&mode=walk&dest=pt:36.70001,137.85002`.
 */
export type ViewState = {
  origin: Coord | null;
  mode: PanelMode;
  resortId: string | null;
  poiId: string | null;
  category: DestinationCategory;
  rank: RankOptions;
  /** A free destination point; when set it wins over resort/place. */
  point: Coord | null;
  /** Stops between the start and the destination, in order (walk). */
  stops: Coord[];
};

/**
 * The sorts the web offers: two since the panel tidy (2026-11-25); the API still
 * accepts the rest. `price` stays hidden in any case: ADR-0001 decision 2 hides it
 * until every resort has a comparable 2026–27 day-ticket price.
 */
export const SORT_KEYS: readonly SortKey[] = ["walk_time", "terrain_size"];

export const DEFAULT_RANK: RankOptions = {
  sort: "walk_time",
  maxWalkMin: null,
  nightSkiing: false,
  hvPass: false,
};

const MODES: readonly PanelMode[] = ["bus", "walk"];
const CATEGORIES: readonly DestinationCategory[] = [
  "resorts",
  "food",
  "convenience",
];

/** Stops between start and destination (SPEC-web-app v1.4; Google allows ~9). */
export const MAX_STOPS = 5;

function parseCoord(value: string | null): Coord | null {
  const raw = value?.split(",");
  // Number("") is 0: an empty part would be a real place (Null Island)
  if (raw?.length !== 2 || raw.some((p) => p.trim() === "")) return null;
  const parts = raw.map(Number);
  if (parts.some(Number.isNaN)) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseRank(params: URLSearchParams): RankOptions {
  const sort = params.get("sort") as SortKey | null;
  const maxWalk = Number(params.get("maxWalk"));
  return {
    sort: sort && SORT_KEYS.includes(sort) ? sort : DEFAULT_RANK.sort,
    maxWalkMin: maxWalk > 0 ? maxWalk : null,
    nightSkiing: params.get("night") === "1",
    hvPass: params.get("hvPass") === "1",
  };
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode") as PanelMode | null;
  const cat = params.get("cat") as DestinationCategory | null;
  // `dest=poi:<id>` / `dest=resort:<id>`; the older `resort=<id>` is still read
  const dest = params.get("dest");
  const [kind, ...rest] = dest ? dest.split(":") : [];
  const destId = rest.join(":");
  return {
    origin: parseCoord(params.get("from")),
    mode: mode && MODES.includes(mode) ? mode : "walk",
    resortId:
      (kind === "resort" && destId ? destId : null) ??
      (params.get("resort") || null),
    poiId: kind === "poi" && destId ? destId : null,
    category: cat && CATEGORIES.includes(cat) ? cat : "resorts",
    rank: parseRank(params),
    point: kind === "pt" ? parseCoord(destId) : null,
    stops: (params.get("stops") ?? "")
      .split(";")
      .flatMap((s) => {
        const c = parseCoord(s);
        return c ? [c] : [];
      })
      .slice(0, MAX_STOPS),
  };
}

export function serializeViewState({
  origin,
  mode,
  resortId,
  poiId,
  category,
  rank,
  point,
  stops,
}: ViewState): string {
  const params = new URLSearchParams();
  if (origin) {
    params.set("from", `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`);
  }
  params.set("mode", mode);
  if (resortId) params.set("resort", resortId);
  if (category !== "resorts") params.set("cat", category);
  if (stops.length > 0) {
    params.set(
      "stops",
      stops.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join(";"),
    );
  }
  if (point) {
    params.set("dest", `pt:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`);
  } else if (poiId) {
    params.set("dest", `poi:${poiId}`);
  }
  // only non-default rank options, so ordinary links stay short
  if (rank.sort !== DEFAULT_RANK.sort) params.set("sort", rank.sort);
  if (rank.maxWalkMin) params.set("maxWalk", String(rank.maxWalkMin));
  if (rank.nightSkiing) params.set("night", "1");
  if (rank.hvPass) params.set("hvPass", "1");
  return `?${params}`;
}
