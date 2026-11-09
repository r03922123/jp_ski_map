import { describe, expect, it } from "vitest";
import {
  type LngLat,
  labelAnchor,
  mapPadding,
  pointAlong,
  routeBounds,
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
      136 + 40,
    );
  });

  it("still leaves map to fit into on a short landscape phone", () => {
    const p = mapPadding({ width: 568, height: 320 });
    expect(320 - p.top - p.bottom).toBeGreaterThan(0);
  });
});
