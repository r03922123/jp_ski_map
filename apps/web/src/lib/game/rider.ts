import { useSyncExternalStore } from "react";
import { createLocalStore } from "@/lib/local-store";

/**
 * The rider's progress, on this device only (SPEC-progression). No positions, routes or
 * times finer than the day are ever stored.
 */
export const RIDER_KEY = "hakuba:rider";
export const RIDER_CORRUPT_KEY = "hakuba:rider-corrupt";
/** The current shape's version; see MIGRATIONS below for older ones. */
export const RIDER_VERSION = 1;
export const MAX_NAME = 20;
export const DEFAULT_NAME = "Rider";

/** ISO dates (JST), e.g. "2026-01-02" */
export type Stamp = { resortId: string; firstAt: string; visits: string[] };
export type QuestState = {
  id: string;
  date: string;
  status: "active" | "done";
  doneAt?: string;
};
export type RiderState = {
  version: typeof RIDER_VERSION;
  name: string;
  stamps: Record<string, Stamp>;
  quests: QuestState[];
  stats: { km: { bus: number; drive: number; walk: number }; trips: number };
};

export function emptyRider(): RiderState {
  return {
    version: RIDER_VERSION,
    name: DEFAULT_NAME,
    stamps: {},
    quests: [],
    stats: { km: { bus: 0, drive: 0, walk: 0 }, trips: 0 },
  };
}

export function rename(state: RiderState, name: string): RiderState {
  const clean = name.trim().slice(0, MAX_NAME);
  return { ...state, name: clean || DEFAULT_NAME };
}

const TITLES: [number, string][] = [
  [8, "Ridge Runner"],
  [5, "Powder Hunter"],
  [3, "Valley Rider"],
  [1, "First Tracks"],
  [0, "Rookie"],
];

/** The rider's title from distinct stamps; every world in the catalog makes a Legend. */
export function titleFor(stamps: number, worlds: number): string {
  if (worlds > 0 && stamps >= worlds) return "Hakuba Legend";
  return TITLES.find(([min]) => stamps >= min)?.[1] ?? "Rookie";
}

// --- validation -----------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string =>
  typeof v === "string" && DATE.test(v);
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStamp(v: unknown): v is Stamp {
  return (
    isRecord(v) &&
    typeof v.resortId === "string" &&
    isDate(v.firstAt) &&
    Array.isArray(v.visits) &&
    v.visits.every(isDate)
  );
}

function isQuest(v: unknown): v is QuestState {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    isDate(v.date) &&
    (v.status === "active" || v.status === "done") &&
    (v.doneAt === undefined || isDate(v.doneAt))
  );
}

// --- migration --------------------------------------------------------------

type Migration = (old: Record<string, unknown>) => Record<string, unknown>;
/**
 * `MIGRATIONS[n]` turns a version-n save into version n+1, as a pure function. Every
 * change to RiderState's shape bumps `version` and adds a step here with a test
 * (SPEC-progression "Data"), so friends' stamps survive app updates.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** `steps` is for tests; the store always uses MIGRATIONS. */
export function parseRider(
  input: unknown,
  steps: Record<number, Migration> = MIGRATIONS,
): RiderState | null {
  if (!isRecord(input) || !Number.isInteger(input.version)) return null;
  let raw = input;
  // count with our own `v`, not raw.version, so a step that forgets to bump can't loop
  for (let v = input.version as number; v < RIDER_VERSION; v++) {
    const step = steps[v];
    if (!step) return null; // too old to read: the store keeps the raw value aside
    const next: unknown = step(raw);
    if (!isRecord(next)) return null;
    raw = next;
  }
  if (raw.version !== RIDER_VERSION || typeof raw.name !== "string")
    return null;
  const { stamps, quests, stats } = raw;
  if (!isRecord(stamps) || !Object.values(stamps).every(isStamp)) return null;
  if (!Array.isArray(quests) || !quests.every(isQuest)) return null;
  if (
    !isRecord(stats) ||
    !isRecord(stats.km) ||
    !isCount(stats.km.bus) ||
    !isCount(stats.km.drive) ||
    !isCount(stats.km.walk) ||
    !isCount(stats.trips)
  )
    return null;
  return raw as RiderState;
}

// --- store ------------------------------------------------------------------

export const riderStore = createLocalStore({
  key: RIDER_KEY,
  corruptKey: RIDER_CORRUPT_KEY,
  parse: parseRider,
  empty: emptyRider,
});

export function useRider(): RiderState {
  return useSyncExternalStore(
    riderStore.subscribe,
    riderStore.getSnapshot,
    riderStore.getServerSnapshot,
  );
}
