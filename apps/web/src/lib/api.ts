import type { components } from "@/lib/api-types";

export type Resort = components["schemas"]["Resort"];
export type Route = components["schemas"]["Route"];
export type Coord = components["schemas"]["Coord"];
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

export const fetchRoute = (mode: Mode, from: Coord, to: Coord) =>
  getJson<Route>(
    `/api/route?mode=${mode}&from=${latLng(from)}&to=${latLng(to)}`,
  );
