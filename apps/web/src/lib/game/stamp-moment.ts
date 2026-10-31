import type { Resort } from "@/lib/api";
import { riderStore } from "@/lib/game/rider";
import { sfx } from "@/lib/game/sfx";
import { jstDate, recordVisit } from "@/lib/game/stamps";

/** The stamp being celebrated right now (one at a time), for the StampMoment overlay. */
export type Moment = { resortId: string; name: string; world: number };

let current: Moment | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

export const stampMoment = {
  get: (): Moment | null => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  show(m: Moment) {
    current = m;
    notify();
  },
  dismiss() {
    current = null;
    notify();
  },
};

/** Log a visit to `resort` today; a first visit earns its stamp, with fanfare. */
export function earnVisit(
  resort: Resort,
  world: number,
  at: Date = new Date(),
): { stamped: boolean; visited: boolean } {
  const result = recordVisit(riderStore.getSnapshot(), resort.id, jstDate(at));
  if (result.visited) riderStore.update(() => result.state);
  if (result.stamped) {
    sfx().play("stamp");
    stampMoment.show({ resortId: resort.id, name: resort.name.en, world });
  }
  return { stamped: result.stamped, visited: result.visited };
}
