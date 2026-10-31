/**
 * The bus panel's "Leave after" box: `YYYY-MM-DDTHH:mm` wall-clock time in Hakuba
 * (an `<input type="datetime-local">` value). Its range is today to a year ahead (T78):
 * timetables are seasonal, and far-off dates are typos (9999-12-31 used to 500).
 */

export type DepartRange = { min: string; max: string };

/** Wall-clock time in Hakuba, to the minute. */
export function nowInHakuba(now: Date = new Date()): string {
  return now
    .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
    .slice(0, 16)
    .replace(" ", "T");
}

export function departRange(now: Date = new Date()): DepartRange {
  const today = nowInHakuba(now).slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  // via Date.UTC, so 29 February rolls over to 1 March rather than an invalid date
  const ahead = new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
  return { min: `${today}T00:00`, max: `${ahead}T23:59` };
}

/** Same-format strings compare in time order. */
export function clampDepart(value: string, { min, max }: DepartRange): string {
  if (value === "") return value;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
