import { describe, expect, it } from "vitest";
import type { SkiLine } from "@/components/map/SkiLinesLayer";
import { skiStats } from "@/lib/ski-stats";

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
