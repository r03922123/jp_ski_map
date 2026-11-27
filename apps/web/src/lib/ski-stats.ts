import {
  runColor,
  type SkiLine,
  type SkiProfile,
} from "@/components/map/SkiLinesLayer";

/** "18° (32%)": OpenSkiMap's way of writing a slope. */
export function slopeText(pct: number) {
  const degrees = Math.round((Math.atan(pct / 100) * 180) / Math.PI);
  return `${degrees}° (${Math.round(pct)}%)`;
}

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
  if (line.slopePct !== null)
    rows.push(["Slope (average)", slopeText(line.slopePct)]);
  return rows;
}

// the run colours of the map, easy to hard; each label names the first difficulty of its colour
const RUN_BANDS = [
  ["Easy", "easy"],
  ["Intermediate", "intermediate"],
  ["Advanced", "advanced"],
  ["Freeride", "freeride"],
  ["Unknown", null],
] as const;
// biggest first, as the API's LiftType lists them
const LIFT_TYPES = [
  "cable_car",
  "gondola",
  "chair_lift",
  "mixed_lift",
  "drag_lift",
  "t-bar",
  "j-bar",
  "platter",
  "rope_tow",
  "magic_carpet",
  "funicular",
  "railway",
];

/** "Chair lift", "T-bar": a lift type as the card writes it. */
export const liftName = (liftType: string) => {
  const s = liftType.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * What OpenSkiMap's ski-area panel shows (SPEC-ski-runs v1.4), summed from a resort's own
 * runs and lifts in the snapshot, so the card matches the lines drawn.
 */
export function resortSummary(own: SkiLine[]) {
  const lows = own.flatMap((l) => l.minElevationM ?? []);
  const highs = own.flatMap((l) => l.maxElevationM ?? []);
  const lowM = lows.length > 0 ? Math.min(...lows) : null;
  const highM = highs.length > 0 ? Math.max(...highs) : null;
  const runs = own.filter((l) => l.kind === "run");
  const metres = (ls: SkiLine[]) =>
    ls.reduce((sum, l) => sum + (l.distanceM ?? 0), 0);
  const runKmByColour = RUN_BANDS.map(([label, difficulty]) => {
    const colour = runColor(difficulty);
    const m = metres(runs.filter((r) => runColor(r.difficulty) === colour));
    return { label, colour, km: m / 1000 };
  }).filter((b) => b.km > 0);
  const lifts = own.flatMap((l) => (l.kind === "lift" && l.liftType) || []);
  // the validator keeps every lift type in the enum
  const liftsByType = [...new Set(lifts)]
    .sort((a, b) => LIFT_TYPES.indexOf(a) - LIFT_TYPES.indexOf(b))
    .map((liftType) => ({
      liftType,
      count: lifts.filter((t) => t === liftType).length,
    }));
  return {
    verticalM: lowM !== null && highM !== null ? highM - lowM : null,
    lowM,
    highM,
    runKmByColour,
    totalRunKm: metres(runs) / 1000,
    liftsByType,
  };
}

export type ResortSummary = ReturnType<typeof resortSummary>;

/** "1 Gondola, 21 Chair lifts" */
export const liftsText = (liftsByType: { liftType: string; count: number }[]) =>
  liftsByType
    .map(({ liftType, count }) => {
      const name = liftName(liftType);
      return `${count} ${count === 1 ? name : `${name}s`}`;
    })
    .join(", ");

/** A run's climbs, drops and steepest stretch, from its height every ~25 m (v1.4). */
export function profileStats({ heightsM: h, resolutionM }: SkiProfile) {
  const rises = h.slice(1).map((x, i) => x - h[i]);
  const slopesPct = rises.map((r) => (Math.abs(r) / resolutionM) * 100);
  return {
    ascentM: rises.reduce((sum, r) => sum + Math.max(r, 0), 0),
    descentM: rises.reduce((sum, r) => sum - Math.min(r, 0), 0),
    maxSlopePct: Math.max(...slopesPct),
    slopesPct,
  };
}

export const profileRows = ({
  ascentM,
  descentM,
  maxSlopePct,
}: ReturnType<typeof profileStats>): [string, string][] => [
  ["Ascent", `${ascentM} m`],
  ["Descent", `${descentM} m`],
  ["Max slope", slopeText(maxSlopePct)],
];

// openskidata-format's getSlopeGradingScaleForUse (downhill, MIT): the steepness below
// which each colour applies, as a fraction
const SLOPE_SCALE = [
  [0.05, null],
  [0.25, "easy"],
  [0.4, "intermediate"],
  [1, "advanced"],
] as const;

/** The colour OpenSkiMap's height profile gives a stretch this steep, in the map's colours. */
export function slopeColour(pct: number) {
  const band = SLOPE_SCALE.find(([max]) => Math.abs(pct) / 100 < max);
  return runColor(band ? band[1] : "freeride");
}
