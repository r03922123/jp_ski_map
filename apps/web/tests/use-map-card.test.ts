/**
 * The map's one card as shown: lib/use-map-card's shownCard driven with an open card and a
 * fake ski-lines list, no React mount. MapShell.test.tsx holds the same rules end to end.
 */
import { describe, expect, it } from "vitest";
import type { SkiLine, SkiLineFeature } from "@/components/map/SkiLinesLayer";
import { type Picked, shownCard } from "@/lib/use-map-card";

const skylineLine: SkiLine = {
  id: "r1",
  kind: "run",
  name: "Skyline",
  difficulty: "easy",
  liftType: null,
  resortId: "happo-one",
  distanceM: 100,
  minElevationM: 1645,
  maxElevationM: 1672,
  slopePct: 27,
  durationS: null,
};
const feature = (
  p: Partial<SkiLine>,
  coordinates: [number, number][],
): SkiLineFeature => ({
  type: "Feature",
  properties: { ...skylineLine, profile: null, ...p },
  geometry: { type: "LineString", coordinates },
});
// three Happo-One lines (a run, a lift west of it, an area east of it) and a Goryu run
const skyline = feature({}, [
  [137.8, 36.7],
  [137.8, 36.71],
]);
const lift = feature({ id: "l1", kind: "lift" }, [
  [137.79, 36.69],
  [137.8, 36.7],
]);
const area: SkiLineFeature = {
  ...feature({ id: "a1" }, []),
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [137.805, 36.7],
        [137.82, 36.7],
        [137.82, 36.72],
        [137.805, 36.7],
      ],
    ],
  },
};
const goryu = feature({ id: "g1", resortId: "goryu" }, [
  [137.85, 36.66],
  [137.86, 36.67],
]);
const LINES = [skyline, lift, area, goryu];

const at = { lat: 36.7, lng: 137.85 };
const pin: Picked = { kind: "pin", pin: { coord: at, name: null } };
const run: Picked = { kind: "line", line: skylineLine, ring: null };
const resort: Picked = {
  kind: "resort",
  resortId: "happo-one",
  fromCard: false,
};
const show = (card: Picked | null) =>
  shownCard(card, { lines: LINES, piloting: false });

describe("shownCard", () => {
  it("shows nothing when no card is open", () => {
    expect(show(null)).toBeNull();
  });

  it("a pin's card puts the pin on the map and reads no lines", () => {
    expect(show(pin)).toEqual({
      card: pin,
      lines: [],
      onMap: { kind: "pin", at },
    });
  });

  it("a run's card outlines it with its ring at once, and frames the whole run once the lines load", () => {
    const ring = { lat: 36.705, lng: 137.8 };
    const card: Picked = { ...run, ring };
    expect(shownCard(card, { piloting: false })).toEqual({
      card,
      lines: [],
      onMap: { kind: "line", id: "r1", ring, frame: null },
    });
    expect(show(card)).toEqual({
      card,
      lines: [skyline],
      onMap: {
        kind: "line",
        id: "r1",
        ring,
        frame: {
          key: "r1",
          bounds: [
            [137.8, 36.7],
            [137.8, 36.71],
          ],
        },
      },
    });
  });

  it("a resort's card reads all its lines and frames them, an area by its outline, Goryu's run left out", () => {
    expect(show(resort)).toEqual({
      card: resort,
      lines: [skyline, lift, area],
      onMap: {
        kind: "resort",
        id: "happo-one",
        frame: {
          key: "resort:happo-one",
          bounds: [
            [137.79, 36.69],
            [137.82, 36.72],
          ],
        },
      },
    });
  });

  it("a resort with no lines in the snapshot is outlined and framed by nothing", () => {
    expect(show({ ...resort, resortId: "jigatake" })?.onMap).toEqual({
      kind: "resort",
      id: "jigatake",
      frame: null,
    });
  });

  it("while navigating no card shows, whichever is open", () => {
    for (const card of [pin, run, resort])
      expect(shownCard(card, { lines: LINES, piloting: true })).toBeNull();
  });
});
