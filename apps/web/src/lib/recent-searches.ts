import type { Suggestion } from "@/lib/api";

/** Per-viewer convenience only: the last few picks, in this browser. */
export const RECENT_KEY = "hakuba:recent-searches";
const MAX_RECENT = 5;

export function loadRecent(): Suggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Suggestion[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(pick: Suggestion): void {
  try {
    const rest = loadRecent().filter((s) => s.id !== pick.id);
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([pick, ...rest].slice(0, MAX_RECENT)),
    );
  } catch {
    // private mode / blocked storage: recents are optional
  }
}
