import type { Mode } from "@/lib/api";
import type { Guidance } from "@/lib/nav/progress";

/**
 * When to speak the next maneuver (metres before it). Driving: early warning and the
 * turn; walking: a short heads-up and at the turn itself.
 */
const THRESHOLDS: Record<Mode, number[]> = {
  drive: [500, 100],
  walk: [50, 10],
};

export const MUTE_KEY = "hakuba:pilot-muted";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * The phrase due now, or null. `said` remembers what was spoken (it is updated): each
 * threshold speaks once per maneuver, and jumping past several speaks only the nearest.
 */
export function dueAnnouncement(
  g: Guidance | null,
  mode: Mode,
  said: Set<string>,
): { key: string; text: string } | null {
  const next = g?.next;
  if (!next) return null;
  const thresholds = THRESHOLDS[mode];
  const crossed = thresholds.filter((t) => next.distanceM <= t);
  if (crossed.length === 0) return null;
  const nearest = Math.min(...crossed);
  const key = `${next.stepIndex}:${nearest}`;
  if (said.has(key)) return null;
  for (const t of crossed) said.add(`${next.stepIndex}:${t}`);
  const atTurn = nearest === thresholds[thresholds.length - 1];
  const text = !atTurn
    ? `In ${nearest} metres, ${lowerFirst(next.instruction)}`
    : mode === "walk"
      ? `${next.instruction} Now.`
      : next.instruction;
  return { key, text };
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // per-viewer convenience only
  }
}

/** iOS only lets a page speak after a user gesture: call this inside the Start tap. */
export function primeSpeech(): void {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function speak(text: string): void {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel(); // a newer instruction replaces a stale one
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  speechSynthesis.speak(u);
}

export function buzz(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(200);
  }
}
