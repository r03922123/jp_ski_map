import {
  addList,
  isCoord,
  type ListIcon,
  type PlaceInput,
  type SavedKind,
  type SavedState,
  toggleInList,
} from "@/lib/saved-places";

/**
 * Share a saved list as a link: `/#import=<base64url JSON>`. The list rides in the URL
 * fragment, which browsers never send to a server, so sharing needs no account.
 * Compact payload: `{ v: 1, n: name, i: icon, p: [[id, name, lat, lng, kind], …] }`.
 */

export const MAX_IMPORT = 200;
const PREFIX = "#import=";

export type ImportedList = {
  name: string;
  icon: ListIcon;
  places: PlaceInput[];
};
export type DecodeResult =
  | { ok: true; list: ImportedList }
  | { ok: false; error: string };

type Row = [string, string, number, number, SavedKind];

export function toBase64url(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64url(code: string): string {
  const b64 = code.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(bin, (c) => c.charCodeAt(0)),
  );
}

export function encodeList(state: SavedState, listId: string): string {
  const list = state.lists.find((l) => l.id === listId);
  const rows: Row[] = state.places
    .filter((p) => p.lists.includes(listId))
    .slice(0, MAX_IMPORT)
    .map((p) => [
      p.id,
      p.name,
      Number(p.coord.lat.toFixed(5)),
      Number(p.coord.lng.toFixed(5)),
      p.kind,
    ]);
  return toBase64url(
    JSON.stringify({
      v: 1,
      n: list?.name ?? "Shared list",
      i: list?.icon ?? "bookmark",
      p: rows,
    }),
  );
}

export function shareUrl(origin: string, code: string): string {
  return `${origin}/${PREFIX}${code}`;
}

export function readImportHash(hash: string): string | null {
  return hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) || null : null;
}

const KINDS = new Set(["lodging", "stop", "resort", "poi", "pin"]);
const ICONS = new Set(["star", "heart", "flag", "bookmark"]);
const short = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;

export function decodeImport(code: string): DecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64url(code));
  } catch {
    return { ok: false, error: "This link is damaged or incomplete." };
  }
  const r = raw as { v?: unknown; n?: unknown; i?: unknown; p?: unknown };
  if (r?.v !== 1 || !short(r.n, 80) || !Array.isArray(r.p)) {
    return { ok: false, error: "This isn't a saved-places link." };
  }
  if (r.p.length > MAX_IMPORT) {
    return {
      ok: false,
      error: `A shared list can hold at most ${MAX_IMPORT} places.`,
    };
  }
  const places: PlaceInput[] = [];
  for (const row of r.p) {
    if (!Array.isArray(row) || row.length !== 5) {
      return { ok: false, error: "This link has a malformed place." };
    }
    const [id, name, lat, lng, kind] = row as unknown[];
    const coord = { lat, lng };
    if (
      !short(id, 120) ||
      !short(name, 80) ||
      !isCoord(coord) ||
      !KINDS.has(kind as string)
    ) {
      return { ok: false, error: "This link has a malformed place." };
    }
    places.push({ id, name, coord, kind: kind as SavedKind });
  }
  return {
    ok: true,
    list: {
      name: r.n,
      icon: ICONS.has(r.i as string) ? (r.i as ListIcon) : "bookmark",
      places,
    },
  };
}

/** Add the places to the list with the same name, creating it when there is none. */
export function importList(state: SavedState, list: ImportedList): SavedState {
  let target = state.lists.find((l) => l.name === list.name)?.id;
  let next = state;
  if (!target) {
    const created = addList(state, list.name, list.icon);
    if (!created) return state;
    next = created.state;
    target = created.id;
  }
  for (const place of list.places) {
    const already = next.places
      .find((p) => p.id === place.id)
      ?.lists.includes(target);
    if (!already) next = toggleInList(next, place, target);
  }
  return next;
}
