import { useSyncExternalStore } from "react";
import type { Coord, Suggestion } from "@/lib/api";

/**
 * Saved places and lists, kept only in this browser (SPEC-saved-places).
 * The state is immutable: every operation returns a new object, and `savedStore`
 * persists it and notifies React through `useSyncExternalStore`.
 */

export const SAVED_KEY = "hakuba:saved";
export const CORRUPT_KEY = "hakuba:saved-corrupt";
export const MAX_LISTS = 20;
export const MAX_PLACES = 500;
const MAX_NOTE = 140;
const MAX_NAME = 80;

export type SavedKind = "lodging" | "stop" | "resort" | "poi" | "pin";
export type ListIcon = "star" | "heart" | "flag" | "bookmark";

export type SavedPlace = {
  id: string;
  name: string;
  coord: Coord;
  kind: SavedKind;
  lists: string[];
  label?: "hotel";
  note?: string;
  savedAt: string;
};
export type SavedList = {
  id: string;
  name: string;
  icon: ListIcon;
  hidden: boolean;
  builtIn: boolean;
};
export type SavedState = {
  version: 1;
  lists: SavedList[];
  places: SavedPlace[];
};
/** What a caller knows about a place before it is saved. */
export type PlaceInput = Pick<SavedPlace, "id" | "name" | "coord" | "kind">;

const BUILT_IN: SavedList[] = [
  {
    id: "starred",
    name: "Starred",
    icon: "star",
    hidden: false,
    builtIn: true,
  },
  {
    id: "favorites",
    name: "Favorites",
    icon: "heart",
    hidden: false,
    builtIn: true,
  },
  {
    id: "want-to-go",
    name: "Want to go",
    icon: "flag",
    hidden: false,
    builtIn: true,
  },
];

export function emptyState(): SavedState {
  return { version: 1, lists: BUILT_IN.map((l) => ({ ...l })), places: [] };
}

/** Id for a place without a source id (a dropped pin): its rounded coordinate. */
export function pinId(coord: Coord): string {
  return `pt:${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`;
}

export function findPlace(state: SavedState, id: string) {
  return state.places.find((p) => p.id === id);
}

export function isSaved(state: SavedState, id: string): boolean {
  return findPlace(state, id) !== undefined;
}

/** The saved place at this coordinate (to ~1 m), e.g. an origin restored from the URL. */
export function placeAt(
  state: SavedState,
  coord: Coord,
): SavedPlace | undefined {
  const eps = 1e-5;
  return state.places.find(
    (p) =>
      Math.abs(p.coord.lat - coord.lat) < eps &&
      Math.abs(p.coord.lng - coord.lng) < eps,
  );
}

export function hotelOf(state: SavedState): SavedPlace | undefined {
  return state.places.find((p) => p.label === "hotel");
}

/** A place stays saved while it is in a list or carries the hotel label. */
function prune(places: SavedPlace[]): SavedPlace[] {
  return places.filter((p) => p.lists.length > 0 || p.label === "hotel");
}

function upsert(
  state: SavedState,
  place: PlaceInput,
  change: (p: SavedPlace) => SavedPlace,
): SavedState {
  const existing = findPlace(state, place.id);
  if (!existing && state.places.length >= MAX_PLACES) return state;
  const base: SavedPlace = existing ?? {
    ...place,
    name: place.name.slice(0, MAX_NAME),
    lists: [],
    savedAt: new Date().toISOString(),
  };
  const next = change(base);
  const places = existing
    ? state.places.map((p) => (p.id === place.id ? next : p))
    : [...state.places, next];
  return { ...state, places: prune(places) };
}

export function toggleInList(
  state: SavedState,
  place: PlaceInput,
  listId: string,
): SavedState {
  if (!state.lists.some((l) => l.id === listId)) return state;
  return upsert(state, place, (p) => ({
    ...p,
    lists: p.lists.includes(listId)
      ? p.lists.filter((l) => l !== listId)
      : [...p.lists, listId],
  }));
}

/** Give `place` the hotel label (moving it from any other place); null clears it. */
export function setHotel(
  state: SavedState,
  place: PlaceInput | null,
): SavedState {
  const cleared: SavedState = {
    ...state,
    places: prune(
      state.places.map((p) => {
        if (p.label !== "hotel") return p;
        const { label: _label, ...rest } = p;
        return rest;
      }),
    ),
  };
  if (!place) return cleared;
  return upsert(cleared, place, (p) => ({ ...p, label: "hotel" }));
}

export function addList(
  state: SavedState,
  name: string,
  icon: ListIcon,
): { state: SavedState; id: string } | null {
  const clean = name.trim().slice(0, MAX_NAME);
  if (!clean || state.lists.length >= MAX_LISTS) return null;
  const id = `list-${Date.now().toString(36)}-${state.lists.length}`;
  const list: SavedList = {
    id,
    name: clean,
    icon,
    hidden: false,
    builtIn: false,
  };
  return { state: { ...state, lists: [...state.lists, list] }, id };
}

export function deleteList(state: SavedState, listId: string): SavedState {
  const list = state.lists.find((l) => l.id === listId);
  if (!list || list.builtIn) return state;
  return {
    ...state,
    lists: state.lists.filter((l) => l.id !== listId),
    places: prune(
      state.places.map((p) => ({
        ...p,
        lists: p.lists.filter((l) => l !== listId),
      })),
    ),
  };
}

export function setListHidden(
  state: SavedState,
  listId: string,
  hidden: boolean,
): SavedState {
  return {
    ...state,
    lists: state.lists.map((l) => (l.id === listId ? { ...l, hidden } : l)),
  };
}

export function setNote(
  state: SavedState,
  placeId: string,
  note: string,
): SavedState {
  const clean = note.trim().slice(0, MAX_NOTE);
  return {
    ...state,
    places: state.places.map((p) =>
      p.id === placeId ? { ...p, note: clean || undefined } : p,
    ),
  };
}

export function removePlace(state: SavedState, placeId: string): SavedState {
  return { ...state, places: state.places.filter((p) => p.id !== placeId) };
}

// --- validation -----------------------------------------------------------

const KINDS = new Set<SavedKind>(["lodging", "stop", "resort", "poi", "pin"]);
const ICONS = new Set<ListIcon>(["star", "heart", "flag", "bookmark"]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isCoord(v: unknown): v is Coord {
  return (
    isRecord(v) &&
    typeof v.lat === "number" &&
    typeof v.lng === "number" &&
    Math.abs(v.lat) <= 90 &&
    Math.abs(v.lng) <= 180
  );
}

function isPlace(v: unknown): v is SavedPlace {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    isCoord(v.coord) &&
    KINDS.has(v.kind as SavedKind) &&
    Array.isArray(v.lists) &&
    v.lists.every((l) => typeof l === "string") &&
    (v.label === undefined || v.label === "hotel") &&
    (v.note === undefined || typeof v.note === "string") &&
    typeof v.savedAt === "string"
  );
}

function isList(v: unknown): v is SavedList {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    ICONS.has(v.icon as ListIcon) &&
    typeof v.hidden === "boolean" &&
    typeof v.builtIn === "boolean"
  );
}

/** A validated state, or null. Built-in lists missing from the input are restored. */
export function parseState(raw: unknown): SavedState | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  if (!Array.isArray(raw.lists) || !Array.isArray(raw.places)) return null;
  if (!raw.lists.every(isList) || !raw.places.every(isPlace)) return null;
  const lists = raw.lists as SavedList[];
  const missing = BUILT_IN.filter((b) => !lists.some((l) => l.id === b.id));
  return {
    version: 1,
    lists: [...missing.map((l) => ({ ...l })), ...lists],
    places: raw.places as SavedPlace[],
  };
}

// --- store ------------------------------------------------------------------

const SERVER_SNAPSHOT = emptyState();

function read(): SavedState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVED_KEY);
  } catch {
    return emptyState(); // storage blocked
  }
  if (raw === null) return emptyState();
  let parsed: SavedState | null = null;
  try {
    parsed = parseState(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (parsed) return parsed;
  try {
    localStorage.setItem(CORRUPT_KEY, raw); // keep it for a manual rescue
  } catch {
    // nothing more we can do
  }
  return emptyState();
}

function createStore() {
  let state: SavedState | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  const getSnapshot = (): SavedState => {
    state ??= read();
    return state;
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SAVED_KEY && e.key !== null) return;
    state = read();
    notify();
  };

  return {
    getSnapshot,
    getServerSnapshot(): SavedState {
      return SERVER_SNAPSHOT;
    },
    subscribe(listener: () => void): () => void {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0)
          window.removeEventListener("storage", onStorage);
      };
    },
    update(change: (s: SavedState) => SavedState): void {
      const next = change(getSnapshot());
      if (next === state) return;
      state = next; // memory first, so a throwing storage still works this session
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        // private mode / quota: kept in memory only
      }
      notify();
    },
    /** Tests only: forget the cached state so the next read hits storage. */
    reset(): void {
      state = null;
    },
  };
}

export const savedStore = createStore();

export function useSaved(): SavedState {
  return useSyncExternalStore(
    savedStore.subscribe,
    () => savedStore.getSnapshot(),
    () => savedStore.getServerSnapshot(),
  );
}

// --- adapters -----------------------------------------------------------------

/** Our place kinds from a search suggestion's kind. */
export function kindFromSuggestion(
  kind: "resort" | "stop" | "lodging" | "food" | "convenience" | "place",
): SavedKind {
  if (kind === "food" || kind === "convenience") return "poi";
  if (kind === "place") return "pin";
  return kind;
}

export type SavedMarker = {
  id: string;
  name: string;
  coord: Coord;
  icon: ListIcon | "hotel";
};

/** What the map draws: places in a visible list, plus My hotel. */
export function visibleMarkers(state: SavedState): SavedMarker[] {
  const visible = new Map(
    state.lists.filter((l) => !l.hidden).map((l) => [l.id, l]),
  );
  return state.places.flatMap((p): SavedMarker[] => {
    if (p.label === "hotel") {
      return [{ id: p.id, name: p.name, coord: p.coord, icon: "hotel" }];
    }
    const list = p.lists.map((id) => visible.get(id)).find(Boolean);
    return list
      ? [{ id: p.id, name: p.name, coord: p.coord, icon: list.icon }]
      : [];
  });
}

const SUGGESTION_KIND: Record<SavedKind, Suggestion["kind"]> = {
  lodging: "lodging",
  stop: "stop",
  resort: "resort",
  poi: "food",
  pin: "place",
};
const MAX_SAVED_SUGGESTIONS = 3;

const fold = (text: string) => text.normalize("NFKC").toLowerCase();

/**
 * Saved places as search suggestions (`source: "saved"`): those whose name contains
 * the query, or for an empty query My hotel first and then the most recent saves.
 */
export function savedMatches(state: SavedState, query: string): Suggestion[] {
  const q = fold(query.trim());
  const names = new Map(state.lists.map((l) => [l.id, l.name]));
  const ordered = [...state.places].sort(
    (a, b) =>
      Number(b.label === "hotel") - Number(a.label === "hotel") ||
      b.savedAt.localeCompare(a.savedAt),
  );
  return ordered
    .flatMap((p): Suggestion[] => {
      const at = q ? fold(p.name).indexOf(q) : -1;
      if (q && at < 0) return [];
      const lists = p.lists.flatMap((id) => names.get(id) ?? []);
      const detail = [p.label === "hotel" ? "My hotel" : null, ...lists]
        .filter(Boolean)
        .join(" · ");
      return [
        {
          id: p.id,
          kind: SUGGESTION_KIND[p.kind],
          name: p.name,
          nameJa: null,
          coord: p.coord,
          detail: detail || null,
          match: q ? [at, at + q.length] : null,
          source: "saved",
        },
      ];
    })
    .slice(0, MAX_SAVED_SUGGESTIONS);
}
