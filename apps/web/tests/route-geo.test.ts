import { describe, expect, it } from "vitest";
import {
  type LngLat,
  labelAnchor,
  MARKER_PX,
  mapPadding,
  pinCardAnchor,
  pinEaseOffsetY,
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
      132 + MARKER_PX, // v1.18: the two-row card (was 184)
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
    expect(y - 190).toBeGreaterThanOrEqual(132); // v1.18: the two-row card (was 184)
  });

  it("doesn't shift a laptop", () => {
    expect(pinEaseOffsetY({ width: 1440, height: 900 })).toBe(0);
  });

  it.each([
    [667, 375],
    [740, 360],
  ])("doesn't push the pin into the sheet at %ix%i", (width, height) => {
    expect(pinEaseOffsetY({ width, height })).toBe(0);
  });

  // v1.18 (recorded change; 375x553 was in the list above): with the two-row card a pin and
  // its 190 px card fit between card and sheet (132 + 190 = 322 < 332), so it moves, and
  // stays above the sheet
  it("at 375x553 the pin now fits above the sheet, and stays out of it", () => {
    const size = { width: 375, height: 553 };
    const { top, bottom } = mapPadding(size);
    const centre = top + (size.height - top - bottom) / 2;
    const y = centre + pinEaseOffsetY(size);

    expect(pinEaseOffsetY(size)).toBeGreaterThan(0);
    expect(y).toBeLessThanOrEqual(size.height * 0.6);
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

  it("eases a pin lower by the top inset, and still not into the moved sheet", () => {
    const flat = pinEaseOffsetY(phone);
    const notched = pinEaseOffsetY({ ...phone, safe });
    const { top, bottom } = mapPadding({ ...phone, safe });
    const y = top + (phone.height - top - bottom) / 2 + notched;
    expect(notched).toBeGreaterThanOrEqual(flat);
    expect(y).toBeLessThanOrEqual(phone.height * 0.6 - 34);
  });

  it("opens a pin's card below it when the moved trip card leaves no room above", () => {
    // 390×1000: 190 px above y = 340 is 150, clear of the flat card (132) but not of
    // 132 + 47; below it, 340 + 190 = 530 still fits above the moved sheet (600 − 34)
    const tall = { width: 390, height: 1000 };
    expect(pinCardAnchor({ x: 200, y: 340, ...tall })).toBeUndefined();
    expect(pinCardAnchor({ x: 200, y: 340, ...tall, safe })).toBe("top");
  });
});
