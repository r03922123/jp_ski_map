import type { Resort } from "@/lib/api";
import type { QuestState, RiderState } from "@/lib/game/rider";
import { worldNumbers } from "@/lib/game/worlds";

/**
 * Daily quests, made on the device (SPEC-progression "Quests"). `questsFor` is pure;
 * a day's set is saved the first time it's made (`syncQuests`), so earning a stamp
 * never swaps a quest for another. A quest's details travel in its id.
 */
export const POWDER_CM = 10;
export const MAX_QUESTS = 3;
const MAX_KEPT = 200;

export type Quest =
  | { id: string; kind: "powder"; date: string; resortId: string; cm: number }
  | { id: string; kind: "explore"; date: string; resortId: string }
  | { id: string; kind: "konbini"; date: string };

export function questOf(id: string): Quest {
  const [kind, date, resortId, cm] = id.split("|");
  if (kind === "powder") return { id, kind, date, resortId, cm: Number(cm) };
  if (kind === "explore") return { id, kind, date, resortId };
  return { id, kind: "konbini", date };
}

/** Today's offer: powder day, a new world, a konbini break (at most 3). */
export function questsFor(
  date: string,
  rider: RiderState,
  resorts: Resort[],
  /** fresh snow in the last 24 h; null when the snow data couldn't be loaded */
  snow: { resortId: string; cm: number }[] | null,
  /** resort ids by drive time from the start, when known */
  nearest: string[] = [],
): Quest[] {
  const quests: Quest[] = [];
  const known = new Set(resorts.map((r) => r.id));
  const best = (snow ?? [])
    .filter((s) => known.has(s.resortId) && s.cm >= POWDER_CM)
    .sort((a, b) => b.cm - a.cm || a.resortId.localeCompare(b.resortId))[0];
  if (best) {
    const cm = Math.round(best.cm);
    quests.push({
      id: `powder|${date}|${best.resortId}|${cm}`,
      kind: "powder",
      date,
      resortId: best.resortId,
      cm,
    });
  }
  const worlds = worldNumbers(resorts);
  const unstamped = resorts
    .map((r) => r.id)
    .filter((id) => !rider.stamps[id])
    .sort((a, b) => {
      const na = nearest.indexOf(a);
      const nb = nearest.indexOf(b);
      if (na !== nb) return (na < 0 ? Infinity : na) - (nb < 0 ? Infinity : nb);
      return (worlds.get(a) ?? 0) - (worlds.get(b) ?? 0);
    });
  if (unstamped[0]) {
    quests.push({
      id: `explore|${date}|${unstamped[0]}`,
      kind: "explore",
      date,
      resortId: unstamped[0],
    });
  }
  quests.push({ id: `konbini|${date}`, kind: "konbini", date });
  return quests.slice(0, MAX_QUESTS);
}

/** Keep today's set if it exists, else save `generated`; drop expired active quests. */
export function syncQuests(
  rider: RiderState,
  date: string,
  generated: Quest[],
): RiderState {
  const kept = rider.quests.filter(
    (q) => q.status === "done" || q.date === date,
  );
  const fresh: QuestState[] = kept.some((q) => q.date === date)
    ? []
    : generated.map((q) => ({ id: q.id, date, status: "active" }));
  const quests = [...kept, ...fresh].slice(-MAX_KEPT);
  return quests.length === rider.quests.length &&
    quests.every((q, i) => q === rider.quests[i])
    ? rider
    : { ...rider, quests };
}

export function todaysQuests(rider: RiderState, date: string): QuestState[] {
  return rider.quests.filter((q) => q.date === date);
}

function finish(
  rider: RiderState,
  date: string,
  done: (q: Quest) => boolean,
): RiderState {
  let changed = false;
  const quests = rider.quests.map((q) => {
    if (q.status !== "active" || q.date !== date || !done(questOf(q.id)))
      return q;
    changed = true;
    return { ...q, status: "done" as const, doneAt: date };
  });
  return changed ? { ...rider, quests } : rider;
}

/** A visit that day finishes powder and explore quests for that resort. */
export function completeVisitQuests(
  rider: RiderState,
  date: string,
): RiderState {
  return finish(
    rider,
    date,
    (q) =>
      (q.kind === "powder" || q.kind === "explore") &&
      (rider.stamps[q.resortId]?.visits.includes(date) ?? false),
  );
}

/** A navigated trip with a konbini stop (or to one) arrived. */
export function completeKonbini(rider: RiderState, date: string): RiderState {
  return finish(rider, date, (q) => q.kind === "konbini");
}

const KONBINI =
  /7-?eleven|seven[- ]?eleven|lawson|family ?mart|ministop|daily yamazaki|seicomart|セブン|ローソン|ファミリーマート|ファミマ|ミニストップ|デイリーヤマザキ|セイコーマート|コンビニ/i;

export function isKonbini(name: string): boolean {
  return KONBINI.test(name);
}
