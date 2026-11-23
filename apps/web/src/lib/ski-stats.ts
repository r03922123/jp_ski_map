import type { SkiLine } from "@/components/map/SkiLinesLayer";

/**
 * The numbers OpenSkiMap's card shows for a run or lift (SPEC-ski-runs v1.2), as
 * [label, value] rows, from what the refresh measured. A row the data can't fill is left
 * out: most lifts have no ride time in OpenStreetMap.
 */
export function skiStats(line: SkiLine): [string, string][] {
  const rows: [string, string][] = [];
  const { distanceM: d, minElevationM: low, maxElevationM: high } = line;
  const vertical = low !== null && high !== null ? high - low : null;
  const t = line.kind === "lift" ? line.durationS : null;
  if (d !== null)
    rows.push([
      "Distance",
      // round in tens of metres: (1355 / 1000).toFixed(2) is "1.35", a float artefact
      d >= 1000 ? `${(Math.round(d / 10) / 100).toFixed(2)} km` : `${d} m`,
    ]);
  if (vertical !== null)
    rows.push(["Vertical", `${vertical} m (${low}–${high} m)`]);
  if (t) {
    if (d !== null) rows.push(["Speed", `${(d / t).toFixed(1)} m/s`]);
    rows.push(["Ride time", t >= 60 ? `${Math.round(t / 60)} min` : `${t} s`]);
    if (vertical !== null)
      rows.push(["Vertical speed", `${Math.round((vertical / t) * 60)} m/min`]);
  }
  if (line.slopePct !== null) {
    const degrees = Math.round(
      (Math.atan(line.slopePct / 100) * 180) / Math.PI,
    );
    rows.push(["Slope (average)", `${degrees}° (${line.slopePct}%)`]);
  }
  return rows;
}
