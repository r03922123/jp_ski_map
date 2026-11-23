import { describe, expect, it } from "vitest";
import {
  type LngLat,
  labelAnchor,
  MARKER_PX,
  mapPadding,
  pointAlong,
  routeBounds,
  SLIM_BAR_PX,
  segment,
} from "@/lib/route-geo";

// A 2 km east-west line through Hakuba village, then 1 km north.
const line: LngLat[] = [
  [137.84, 36.7],
  [137.85, 36.7],
  [137.86, 36.7],
  [137.86, 36.709],
];

describe("routeBounds", () => {
  it("returns [[west, south], [east, north]]", () => {
    expect(routeBounds(line)).toEqual([
      [137.84, 36.7],
      [137.86, 36.709],
    ]);
  });
});

describe("pointAlong", () => {
  it("interpolates by distance, not by vertex count", () => {
    const [lng, lat] = pointAlong(line, 0.5);
    // ~1.79 km east leg + 1.0 km north leg → halfway is on the east leg
    expect(lat).toBeCloseTo(36.7, 5);
    expect(lng).toBeGreaterThan(137.855);
    expect(lng).toBeLessThan(137.86);
  });

  it("clamps to the ends", () => {
    expect(pointAlong(line, 0)).toEqual(line[0]);
    expect(pointAlong(line, 1)).toEqual(line[3]);
  });
});

describe("labelAnchor", () => {
  it("puts the primary label halfway along its route", () => {
    expect(labelAnchor(line, [])).toEqual(pointAlong(line, 0.5));
  });

  it("puts an alternate label where it is farthest from the other routes", () => {
    const detour: LngLat[] = [
      [137.84, 36.7],
      [137.85, 36.72], // bulges 2 km north of the primary
      [137.86, 36.7],
    ];

    expect(labelAnchor(detour, [line])).toEqual([137.85, 36.72]);
  });
});

describe("segment", () => {
  it("slices the inclusive shape range", () => {
    expect(segment(line, [1, 2])).toEqual([line[1], line[2]]);
  });
});

describe("mapPadding", () => {
  it("leaves room for the floating card on desktop", () => {
    const p = mapPadding({ width: 1280, height: 800 });
    expect(p.left).toBeGreaterThanOrEqual(384 + 12);
    expect(p.bottom).toBeLessThan(100);
  });

  // v1.9 (BC-L1): the peek stays at 40 % and the From/To card sits on top of the map
  it("leaves room for the 40 % sheet below and the trip card above on phones", () => {
    const p = mapPadding({ width: 390, height: 844 });
    expect(p.bottom).toBeGreaterThanOrEqual(0.4 * 844);
    expect(p.top).toBeGreaterThanOrEqual(120);
    expect(p.left).toBeLessThan(60);
  });

  it("leaves room on phones for a marker standing above its point", () => {
    expect(mapPadding({ width: 390, height: 699 }).top).toBeGreaterThanOrEqual(
      118 + MARKER_PX, // v1.27: the slimmer card (v1.18: 132, before it 184)
    );
  });

  // the landscape trip card is 120 px tall with a 4 px frame; the start marker stands
  // MARKER_PX above its point, so a point on the padding line must clear 124 + MARKER_PX
  it.each([
    [740, 360],
    [667, 375],
  ])("keeps a whole marker's room on a %ix%i landscape phone", (width, height) => {
    expect(mapPadding({ width, height }).top).toBeGreaterThanOrEqual(
      120 + 4 + MARKER_PX,
    );
  });

  // a landscape phone with a route: the sheet is only its ETA + Start row, so the
  // route gets the height the 40 % sheet took (28 px left to fit into at 740x360 before)
  it.each([
    [740, 360],
    [667, 375],
  ])("fits above the slim ETA bar on a %ix%i landscape phone", (width, height) => {
    const p = mapPadding({ width, height, slimSheet: true });
    expect(p.bottom).toBeGreaterThanOrEqual(SLIM_BAR_PX);
    expect(p.bottom).toBeLessThanOrEqual(SLIM_BAR_PX + 16);
    expect(height - p.top - p.bottom).toBeGreaterThanOrEqual(3 * 28);
  });

  it("keeps the 40 % sheet's room on a tall phone, slim or not", () => {
    expect(mapPadding({ width: 390, height: 699, slimSheet: true })).toEqual(
      mapPadding({ width: 390, height: 699 }),
    );
  });

  it.each([320, 280, 200])("leaves map to fit into at %i px tall", (height) => {
    const p = mapPadding({ width: 568, height });
    expect(height - p.top - p.bottom).toBeGreaterThan(0);
  });
});

// v1.19: the page runs under the status bar and home indicator; the panels move by the insets
describe("safe-area insets (SPEC-web-app v1.19)", () => {
  const phone = { width: 390, height: 844 };
  const safe = { top: 47, bottom: 34 };

  it("moves the fit's top and bottom by the insets", () => {
    const flat = mapPadding(phone);
    const notched = mapPadding({ ...phone, safe });
    expect(notched.top).toBe(flat.top + 47);
    expect(notched.bottom).toBe(flat.bottom + 34);
  });
});

describe("safe-area insets from md up (v1.19 review: a notched iPhone in landscape is ≥ 812 px wide)", () => {
  it("moves the side card's fit by the left and top insets", () => {
    const flat = mapPadding({ width: 844, height: 390 });
    const notched = mapPadding({
      width: 844,
      height: 390,
      safe: { top: 0, bottom: 21, left: 47, right: 47 },
    });
    expect(notched.left).toBe(flat.left + 47);
    expect(notched.right).toBe(flat.right + 47);
    expect(notched.bottom).toBe(flat.bottom + 21);
  });
});
