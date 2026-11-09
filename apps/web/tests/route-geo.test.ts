import { describe, expect, it } from "vitest";
import {
  type LngLat,
  labelAnchor,
  mapPadding,
  pinCardAnchor,
  pinEaseOffsetY,
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
      184 + 40,
    );
  });

  it("keeps marker room on a landscape phone", () => {
    expect(mapPadding({ width: 740, height: 360 }).top).toBeGreaterThanOrEqual(
      160,
    );
  });

  it.each([320, 280, 200])("leaves map to fit into at %i px tall", (height) => {
    const p = mapPadding({ width: 568, height });
    expect(height - p.top - p.bottom).toBeGreaterThan(0);
  });
});

// v1.9 rule 7: a dropped pin's card never opens under the trip card on top
describe("pinCardAnchor", () => {
  const phone = { width: 393, height: 852 };

  it("opens below a pin whose card would reach under the top card", () => {
    expect(pinCardAnchor({ x: 200, y: 220, ...phone })).toBe("top");
    expect(pinCardAnchor({ x: 200, y: 220, width: 390, height: 699 })).toBe(
      "top",
    );
    expect(pinCardAnchor({ x: 180, y: 220, width: 360, height: 740 })).toBe(
      "top",
    );
  });

  it("keeps the card on screen beside either edge", () => {
    expect(pinCardAnchor({ x: 370, y: 220, ...phone })).toBe("top-right");
    expect(pinCardAnchor({ x: 20, y: 220, ...phone })).toBe("top-left");
  });

  it("leaves a pin lower down to MapLibre, where the card fits above it", () => {
    expect(pinCardAnchor({ x: 200, y: 450, ...phone })).toBeUndefined();
  });

  it("doesn't open down into the sheet", () => {
    expect(
      pinCardAnchor({ x: 200, y: 340, width: 393, height: 699 }),
    ).toBeUndefined();
  });

  it("leaves a laptop to MapLibre: its trip card is in a side panel", () => {
    expect(
      pinCardAnchor({ x: 900, y: 100, width: 1440, height: 900 }),
    ).toBeUndefined();
  });
});

// the ease brings the pin low enough that its card fits above it, under the top card
describe("pinEaseOffsetY", () => {
  it.each([
    [393, 852],
    [360, 740],
    [390, 699],
  ])("at %ix%i the pin ends where its card fits above it", (width, height) => {
    const { top, bottom } = mapPadding({ width, height });
    const centre = top + (height - top - bottom) / 2;
    const y = centre + pinEaseOffsetY({ width, height });

    expect(y).toBeLessThanOrEqual(height * 0.6);
    expect(pinCardAnchor({ x: 200, y, width, height })).toBeUndefined();
    expect(y - 190).toBeGreaterThanOrEqual(184);
  });

  it("doesn't shift a laptop", () => {
    expect(pinEaseOffsetY({ width: 1440, height: 900 })).toBe(0);
  });

  it.each([
    [667, 375],
    [740, 360],
    [375, 553],
  ])("doesn't push the pin into the sheet at %ix%i", (width, height) => {
    expect(pinEaseOffsetY({ width, height })).toBe(0);
  });
});
