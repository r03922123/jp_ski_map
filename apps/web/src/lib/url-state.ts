import type { PanelMode } from "@/components/ModePanel";
import type { Coord, SortKey } from "@/lib/api";

export type RankOptions = {
  sort: SortKey;
  /** YYYY-MM-DD, null = today */
  date: string | null;
  maxDriveMin: number | null;
  nightSkiing: boolean;
  hvPass: boolean;
};

/** The shareable part of the view: `?from=lat,lng&mode=drive&resort=happo-one&sort=…`. */
export type ViewState = {
  origin: Coord | null;
  mode: PanelMode;
  resortId: string | null;
  rank: RankOptions;
};

export const SORT_KEYS: readonly SortKey[] = [
  "drive_time",
  "fresh_snow",
  "snow_depth",
  "crowd",
  "terrain_size",
  "vertical",
  "price",
];

export const DEFAULT_RANK: RankOptions = {
  sort: "drive_time",
  date: null,
  maxDriveMin: null,
  nightSkiing: false,
  hvPass: false,
};

const MODES: readonly PanelMode[] = ["bus", "drive", "walk"];

function parseCoord(value: string | null): Coord | null {
  const parts = value?.split(",").map(Number);
  if (parts?.length !== 2 || parts.some(Number.isNaN)) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function parseRank(params: URLSearchParams): RankOptions {
  const sort = params.get("sort") as SortKey | null;
  const date = params.get("date");
  const maxDrive = Number(params.get("maxDrive"));
  return {
    sort: sort && SORT_KEYS.includes(sort) ? sort : DEFAULT_RANK.sort,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    maxDriveMin: maxDrive > 0 ? maxDrive : null,
    nightSkiing: params.get("night") === "1",
    hvPass: params.get("hvPass") === "1",
  };
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode") as PanelMode | null;
  return {
    origin: parseCoord(params.get("from")),
    mode: mode && MODES.includes(mode) ? mode : "drive",
    resortId: params.get("resort") || null,
    rank: parseRank(params),
  };
}

export function serializeViewState({
  origin,
  mode,
  resortId,
  rank,
}: ViewState): string {
  const params = new URLSearchParams();
  if (origin) {
    params.set("from", `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`);
  }
  params.set("mode", mode);
  if (resortId) params.set("resort", resortId);
  // only non-default rank options, so ordinary links stay short
  if (rank.sort !== DEFAULT_RANK.sort) params.set("sort", rank.sort);
  if (rank.date) params.set("date", rank.date);
  if (rank.maxDriveMin) params.set("maxDrive", String(rank.maxDriveMin));
  if (rank.nightSkiing) params.set("night", "1");
  if (rank.hvPass) params.set("hvPass", "1");
  return `?${params}`;
}
