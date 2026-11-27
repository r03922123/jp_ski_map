import { describe, expect, it } from "vitest";
import { runColor, type SkiLine } from "@/components/map/SkiLinesLayer";
import {
  liftsText,
  profileRows,
  profileStats,
  resortSummary,
  skiStats,
  slopeColour,
  slopeText,
} from "@/lib/ski-stats";

// OpenSkiMap's card for Gondola Adam (2026-11-23): Distance 2.04 km, Vertical 623 m
// (768m - 1391m), Speed 4.3 m/s, Ride time 8 min, Vertical speed 78 m/min, Slope 18° (32%)
const ADAM: SkiLine = {
  id: "adam",
  kind: "lift",
  name: "八方ゴンドラリフト「アダム」, Gondola Adam",
  difficulty: null,
  liftType: "gondola",
  resortId: "happo-one",
  distanceM: 2044,
  minElevationM: 768,
  maxElevationM: 1391,
  slopePct: 32.3,
  durationS: 480,
};

describe("skiStats", () => {
  // review: degrees come from the 1-dp percent; 20.4% is 11.5° (12°), a whole 20% is 11.3° (11°)
  it("rounds the degrees from the precise slope", () => {
    expect(skiStats({ ...ADAM, slopePct: 20.6 }).at(-1)).toEqual([
      "Slope (average)",
      "12° (21%)",
    ]);
    expect(skiStats({ ...ADAM, slopePct: 20.4 }).at(-1)).toEqual([
      "Slope (average)",
      "12° (20%)",
    ]);
  });

  it("gives a timed lift the numbers OpenSkiMap shows", () => {
    expect(skiStats(ADAM)).toEqual([
      ["Distance", "2.04 km"],
      ["Vertical", "623 m (768–1391 m)"],
      ["Speed", "4.3 m/s"],
      ["Ride time", "8 min"],
      ["Vertical speed", "78 m/min"],
      ["Slope (average)", "18° (32%)"],
    ]);
  });

  it("leaves out what the data doesn't have: a run has no ride time, a short one is in m", () => {
    expect(
      skiStats({
        ...ADAM,
        kind: "run",
        liftType: null,
        difficulty: "easy",
        distanceM: 850,
        durationS: null,
      }),
    ).toEqual([
      ["Distance", "850 m"],
      ["Vertical", "623 m (768–1391 m)"],
      ["Slope (average)", "18° (32%)"],
    ]);
  });

  it("shows nothing for a line with no length, slope or elevations", () => {
    expect(
      skiStats({
        ...ADAM,
        distanceM: null,
        minElevationM: null,
        maxElevationM: null,
        slopePct: null,
        durationS: null,
      }),
    ).toEqual([]);
  });
});

// SPEC-ski-runs v1.4: the resort card sums the resort's own lines (which use-map-card picks),
// as OpenSkiMap's does
describe("resortSummary", () => {
  const line = (p: Partial<SkiLine>): SkiLine => ({
    ...ADAM,
    kind: "run",
    liftType: null,
    durationS: null,
    ...p,
  });
  const lines: SkiLine[] = [
    line({ id: "a", difficulty: "easy", distanceM: 1200, minElevationM: 760 }),
    line({ id: "b", difficulty: "novice", distanceM: 300 }),
    line({ id: "c", difficulty: "advanced", distanceM: 800 }),
    line({ id: "d", difficulty: "intermediate", distanceM: 2000 }),
    line({ id: "e", difficulty: null, distanceM: 100, maxElevationM: 1500 }),
    // an area: no length, still counts for the heights
    line({ id: "f", difficulty: "easy", distanceM: null, minElevationM: 749 }),
    { ...ADAM, id: "g", liftType: "chair_lift" },
    { ...ADAM, id: "h", liftType: "chair_lift", maxElevationM: 1829 },
    { ...ADAM, id: "i", liftType: "gondola" },
  ];

  it("sums vertical, run km by the map's colours (easy to hard) and lifts by type", () => {
    expect(resortSummary(lines)).toEqual({
      verticalM: 1080,
      lowM: 749,
      highM: 1829,
      runKmByColour: [
        { label: "Easy", colour: runColor("easy"), km: 1.5 },
        { label: "Intermediate", colour: runColor("intermediate"), km: 2 },
        { label: "Advanced", colour: runColor("advanced"), km: 0.8 },
        { label: "Unknown", colour: runColor(null), km: 0.1 },
      ],
      totalRunKm: 4.4,
      liftsByType: [
        { liftType: "gondola", count: 1 },
        { liftType: "chair_lift", count: 2 },
      ],
    });
  });

  it("names the lifts by type, plural by count", () => {
    expect(
      liftsText([
        { liftType: "gondola", count: 1 },
        { liftType: "chair_lift", count: 21 },
        { liftType: "t-bar", count: 2 },
      ]),
    ).toBe("1 Gondola, 21 Chair lifts, 2 T-bars");
  });

  it("has no vertical when no line has heights", () => {
    const flat = lines.map((l) => ({
      ...l,
      minElevationM: null,
      maxElevationM: null,
    }));
    expect(resortSummary(flat)).toMatchObject({
      verticalM: null,
      lowM: null,
      highM: null,
    });
  });
});

describe("profileStats", () => {
  it("adds up the climbs and drops and finds the steepest 25 m", () => {
    // down 5, up 2, down 10 (40 %), down 1
    const stats = profileStats({
      heightsM: [1200, 1195, 1197, 1187, 1186],
      resolutionM: 25,
    });
    expect(stats).toEqual({
      ascentM: 2,
      descentM: 16,
      maxSlopePct: 40,
      slopesPct: [20, 8, 40, 4],
    });
  });

  it("turns into rows for the card", () => {
    expect(
      profileRows({ ascentM: 2, descentM: 16, maxSlopePct: 40, slopesPct: [] }),
    ).toEqual([
      ["Ascent", "2 m"],
      ["Descent", "16 m"],
      ["Max slope", "22° (40%)"],
    ]);
  });
});

// openskidata-format getSlopeGradingScaleForUse (downhill), in the map's run colours
describe("slopeColour", () => {
  it.each([
    [0, runColor(null)],
    [4.9, runColor(null)],
    [5, runColor("easy")],
    [24.9, runColor("easy")],
    [25, runColor("intermediate")],
    [39.9, runColor("intermediate")],
    [40, runColor("advanced")],
    [99.9, runColor("advanced")],
    [100, runColor("freeride")],
    [-30, runColor("intermediate")], // a climb is as steep as a drop
  ])("%s %% is %s", (pct, colour) => {
    expect(slopeColour(pct)).toBe(colour);
  });
});

describe("slopeText", () => {
  it("gives degrees and the whole percent", () => {
    expect(slopeText(25)).toBe("14° (25%)");
  });
});
