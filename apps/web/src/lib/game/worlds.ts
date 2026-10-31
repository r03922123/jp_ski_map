import type { Resort } from "@/lib/api";

/**
 * World numbers W1…Wn by geography, north to south (SPEC-game-theme), so a resort keeps
 * its number whatever the list is sorted by. Ties (none today) break by id.
 */
export function worldNumbers(resorts: Resort[]): Map<string, number> {
  const north = (r: Resort) =>
    Math.max(...r.accessPoints.map((a) => a.coord.lat));
  const ordered = [...resorts].sort(
    (a, b) => north(b) - north(a) || a.id.localeCompare(b.id),
  );
  return new Map(ordered.map((r, i) => [r.id, i + 1]));
}
