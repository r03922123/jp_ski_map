import type { PanelMode } from "@/components/ModePanel";
import type { Coord } from "@/lib/api";

/** The shareable part of the view: `?from=lat,lng&mode=drive&resort=happo-one`. */
export type ViewState = {
  origin: Coord | null;
  mode: PanelMode;
  resortId: string | null;
};

const MODES: readonly PanelMode[] = ["bus", "drive", "walk"];

function parseCoord(value: string | null): Coord | null {
  const parts = value?.split(",").map(Number);
  if (parts?.length !== 2 || parts.some(Number.isNaN)) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function parseViewState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const mode = params.get("mode") as PanelMode | null;
  return {
    origin: parseCoord(params.get("from")),
    mode: mode && MODES.includes(mode) ? mode : "drive",
    resortId: params.get("resort") || null,
  };
}

export function serializeViewState({
  origin,
  mode,
  resortId,
}: ViewState): string {
  const params = new URLSearchParams();
  if (origin) {
    params.set("from", `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`);
  }
  params.set("mode", mode);
  if (resortId) params.set("resort", resortId);
  return `?${params}`;
}
