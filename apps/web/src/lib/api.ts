import type { components, operations } from "@/lib/api-types";

export type Resort = components["schemas"]["Resort"];
export type Route = components["schemas"]["Route"];
export type RouteSet = components["schemas"]["RouteSet"];
export type Step = components["schemas"]["Step"];
export type Maneuver = Step["maneuver"];
export type Coord = components["schemas"]["Coord"];
export type Place = components["schemas"]["Place"];
export type RankedResort = components["schemas"]["RankedResort"];
export type SnowReport = components["schemas"]["SnowReport"];
export type BusResult = components["schemas"]["BusResult"];
export type BusOption = components["schemas"]["BusOption"];
export type NightDeparture = components["schemas"]["NightDeparture"];
export type NightResult = components["schemas"]["NightResult"];
export type NearbyPoi = components["schemas"]["NearbyPoi"];
export type Suggestion = components["schemas"]["Suggestion"];
export type PoiCategory = NearbyPoi["category"];
export type SortKey = NonNullable<
  NonNullable<
    operations["get_rank_api_rank_get"]["parameters"]["query"]
  >["sort"]
>;
export type Mode = Route["mode"];

/** Error code from the API body (`{"error": "no_route"}`), or the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `http_${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

const latLng = (c: Coord) => `${c.lat},${c.lng}`;

export const fetchResorts = () => getJson<Resort[]>("/api/resorts");
export const fetchSnow = () => getJson<SnowReport[]>("/api/snow");

export const fetchRoute = (mode: Mode, from: Coord, to: Coord) =>
  getJson<Route>(
    `/api/route?mode=${mode}&from=${latLng(from)}&to=${latLng(to)}`,
  );

/** Primary route plus up to two alternates. */
export const fetchRoutes = (mode: Mode, from: Coord, to: Coord) =>
  getJson<RouteSet>(
    `/api/routes?mode=${mode}&from=${latLng(from)}&to=${latLng(to)}`,
  );

/** One route through ordered points (e.g. a bus ride's stops). */
export async function fetchPath(
  mode: Mode,
  points: Coord[],
  { stopAtPoints = false }: { stopAtPoints?: boolean } = {},
): Promise<Route> {
  const response = await fetch("/api/route/path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // stopAtPoints: the middle points are a trip's stops, not a bus line's pass-throughs
    body: JSON.stringify({ mode, points, stopAtPoints }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `http_${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<Route>;
}

/** Search-as-you-type: local index first, Photon when it comes up short, links handled. */
export const fetchSuggestions = (q: string, near: Coord | null) =>
  getJson<Suggestion[]>(
    `/api/places/suggest?q=${encodeURIComponent(q)}${near ? `&near=${latLng(near)}` : ""}`,
  );

export const fetchPlaces = (q: string) =>
  getJson<Place[]>(`/api/places/search?q=${encodeURIComponent(q)}`);

export type Bbox = { south: number; west: number; north: number; east: number };

export const fetchLodging = ({ south, west, north, east }: Bbox) =>
  getJson<Place[]>(
    `/api/places/lodging?bbox=${south},${west},${north},${east}`,
  );

export type RankQuery = {
  sort: SortKey;
  date: string | null;
  maxDriveMin: number | null;
  nightSkiing: boolean;
  hvPass: boolean;
};

export function fetchRank(from: Coord, q: RankQuery) {
  const params = new URLSearchParams({ from: latLng(from), sort: q.sort });
  if (q.date) params.set("date", q.date);
  if (q.maxDriveMin) params.set("maxDriveMin", String(q.maxDriveMin));
  if (q.nightSkiing) params.set("nightSkiing", "true");
  if (q.hvPass) params.set("hakubaValleyPass", "true");
  return getJson<RankedResort[]>(`/api/rank?${params}`);
}

/** `departAt` is local Hakuba time, "YYYY-MM-DDTHH:mm". */
const jst = (departAt: string) => encodeURIComponent(`${departAt}:00+09:00`);

/** `placeName`: the searched hotel/place, so its own pickup stop counts as walk 0. */
export function fetchBusOptions(
  from: Coord,
  departAt: string,
  placeName: string | null = null,
) {
  const name = placeName ? `&name=${encodeURIComponent(placeName)}` : "";
  return getJson<BusResult>(
    `/api/bus/options?from=${latLng(from)}&at=${jst(departAt)}${name}`,
  );
}

/** Restaurants or konbini near `from`, sorted by travel time for `mode`. */
export const fetchNearbyPois = (
  from: Coord,
  category: PoiCategory,
  mode: Mode,
  limit = 10,
) =>
  getJson<NearbyPoi[]>(
    `/api/pois/nearby?from=${latLng(from)}&category=${category}&mode=${mode}&limit=${limit}`,
  );

export const fetchNightBus = (from: Coord, departAt: string) =>
  getJson<NightResult>(
    `/api/bus/night?from=${latLng(from)}&at=${jst(departAt)}`,
  );
