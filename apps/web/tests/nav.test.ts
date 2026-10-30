import { describe, expect, it } from "vitest";
import type { Route } from "@/lib/api";
import { cameraFor } from "@/lib/nav/camera";
import { progress } from "@/lib/nav/progress";
import { type Fix, prepare, projectForward } from "@/lib/nav/project";
import { initialNav, OFF_ROUTE_LIMIT, reduceNav } from "@/lib/nav/session";
import type { LngLat } from "@/lib/route-geo";
import driveFixture from "./fixtures/route-drive.json";
import walkFixture from "./fixtures/route-walk.json";

const drive = driveFixture as unknown as Route;
const walk = walkFixture as unknown as Route;

const LAT = 36.7;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320 * Math.cos((LAT * Math.PI) / 180);

/** A point `east` metres east and `north` metres north of (LAT, 137.85). */
function at(east: number, north = 0): LngLat {
  return [137.85 + east / M_PER_DEG_LNG, LAT + north / M_PER_DEG_LAT];
}
function fix(p: LngLat, extra: Partial<Fix> = {}): Fix {
  return {
    lng: p[0],
    lat: p[1],
    accuracyM: 5,
    speedMps: null,
    headingDeg: null,
    t: 0,
    ...extra,
  };
}

/** A straight 900 m street, east-bound, a vertex every 100 m, two steps. */
function straight(mode: "drive" | "walk" = "drive"): Route {
  const coordinates = Array.from({ length: 10 }, (_, i) => at(i * 100));
  return {
    mode,
    durationS: 90,
    distanceM: 900,
    isEstimate: false,
    geometry: { type: "LineString", coordinates },
    steps: [
      {
        instruction: "Head east.",
        distanceM: 500,
        durationS: 50,
        maneuver: "depart",
        streetNames: [],
        shapeRange: [0, 5],
      },
      {
        instruction: "Continue.",
        distanceM: 400,
        durationS: 40,
        maneuver: "straight",
        streetNames: [],
        shapeRange: [5, 9],
      },
      {
        instruction: "Arrive.",
        distanceM: 0,
        durationS: 0,
        maneuver: "arrive",
        streetNames: [],
        shapeRange: [9, 9],
      },
    ],
  } as Route;
}

/** Out 500 m east, then back west on a parallel street 15 m to the north. */
function uTurn(): Route {
  const out = Array.from({ length: 6 }, (_, i) => at(i * 100));
  const back = Array.from({ length: 6 }, (_, i) => at(500 - i * 100, 15));
  const coordinates = [...out, ...back];
  return {
    ...straight(),
    distanceM: 1015,
    geometry: { type: "LineString", coordinates },
    steps: [
      {
        instruction: "Out.",
        distanceM: 500,
        durationS: 50,
        maneuver: "depart",
        streetNames: [],
        shapeRange: [0, 5],
      },
      {
        instruction: "U-turn.",
        distanceM: 515,
        durationS: 52,
        maneuver: "uturn",
        streetNames: [],
        shapeRange: [5, 11],
      },
      {
        instruction: "Arrive.",
        distanceM: 0,
        durationS: 0,
        maneuver: "arrive",
        streetNames: [],
        shapeRange: [11, 11],
      },
    ],
  } as Route;
}

describe("projectForward", () => {
  it("projects onto the line with the perpendicular offset and distance along", () => {
    const r = prepare(straight());
    const p = projectForward(r, fix(at(450, 10)), 0);
    expect(p.offsetM).toBeCloseTo(10, 0);
    expect(p.alongM).toBeCloseTo(450, -1);
    expect(p.index).toBe(4);
  });

  it("never jumps ahead to a later, closer part of the route", () => {
    const r = prepare(uTurn());
    // 8 m north of the out leg, 7 m from the way back: still on the out leg
    const early = projectForward(r, fix(at(100, 8)), 0);
    expect(early.index).toBeLessThan(5);
    // once past the turn, the same spot matches the way back
    const late = projectForward(r, fix(at(100, 13)), 6);
    expect(late.index).toBeGreaterThanOrEqual(6);
  });
});

describe("progress", () => {
  it("counts down distance and time monotonically along a real route", () => {
    const r = prepare(drive);
    let lastM = Number.POSITIVE_INFINITY;
    let lastS = Number.POSITIVE_INFINITY;
    let from = 0;
    for (const c of drive.geometry.coordinates as LngLat[]) {
      const p = projectForward(r, fix(c), from);
      from = p.index;
      const g = progress(r, p);
      expect(g.remainingM).toBeLessThanOrEqual(lastM + 1e-6);
      expect(g.remainingS).toBeLessThanOrEqual(lastS + 1e-6);
      lastM = g.remainingM;
      lastS = g.remainingS;
    }
    const start = progress(
      r,
      projectForward(r, fix(drive.geometry.coordinates[0] as LngLat), 0),
    );
    expect(start.remainingM).toBeGreaterThan(drive.distanceM * 0.95);
    expect(start.remainingM).toBeLessThan(drive.distanceM * 1.05);
    expect(start.remainingS).toBeCloseTo(drive.durationS, -1);
    expect(lastM).toBeLessThan(1);
  });

  it("names the next maneuver, its distance, and a close 'then'", () => {
    const r = prepare(walk);
    const g = progress(
      r,
      projectForward(r, fix(walk.geometry.coordinates[0] as LngLat), 0),
    );
    expect(g.next?.maneuver).toBe(walk.steps[1].maneuver);
    expect(g.next?.distanceM).toBeCloseTo(walk.steps[0].distanceM, -1);

    const s = prepare(straight());
    const near = progress(s, projectForward(s, fix(at(420)), 0));
    expect(near.next?.maneuver).toBe("straight");
    expect(near.next?.distanceM).toBeCloseTo(80, 0);
    expect(near.then).toBeNull(); // the arrival is 400 m after it, too far for "then"
  });
});

describe("reduceNav (Organic Maps' off-route rule)", () => {
  const r = prepare(straight());

  it("follows the route and snaps the puck within the 50 m drive radius", () => {
    const s = reduceNav(initialNav(), r, fix(at(300, 45)));
    expect(s.phase).toBe("following");
    expect(s.projection?.offsetM).toBeCloseTo(45, 0);
  });

  it("widens the radius to the GPS accuracy", () => {
    const off = reduceNav(initialNav(), r, fix(at(300, 70)));
    expect(off.phase).toBe("following"); // a single miss doesn't trip
    expect(off.moveAway).toBe(1);
    const inaccurate = reduceNav(
      initialNav(),
      r,
      fix(at(300, 70), { accuracyM: 80 }),
    );
    expect(inaccurate.moveAway).toBe(0);
  });

  it("counts +2 per fix when moving, +1 when slow or speed unknown, and trips past 10", () => {
    let s = reduceNav(initialNav(), r, fix(at(100)));
    let fixes = 0;
    while (s.phase !== "offRoute" && fixes < 50) {
      fixes += 1;
      s = reduceNav(
        s,
        r,
        fix(at(100 + fixes * 5, 100 + fixes * 10), { speedMps: 10 }),
      );
    }
    expect(fixes).toBe(Math.floor(OFF_ROUTE_LIMIT / 2) + 1); // 6 fixes × 2 = 12 > 10

    let slow = reduceNav(initialNav(), r, fix(at(100)));
    let slowFixes = 0;
    while (slow.phase !== "offRoute" && slowFixes < 50) {
      slowFixes += 1;
      slow = reduceNav(slow, r, fix(at(100, 100 + slowFixes * 10)));
    }
    expect(slowFixes).toBe(OFF_ROUTE_LIMIT + 1);
  });

  it("ignores fixes whose distance didn't change, and weak GPS", () => {
    let s = reduceNav(initialNav(), r, fix(at(100)));
    s = reduceNav(s, r, fix(at(100, 200)));
    const again = reduceNav(s, r, fix(at(100, 200)));
    expect(again.moveAway).toBe(s.moveAway);
    const weak = reduceNav(s, r, fix(at(100, 300), { accuracyM: 150 }));
    expect(weak.moveAway).toBe(s.moveAway);
  });

  it("resets the counter when back on the route", () => {
    let s = reduceNav(initialNav(), r, fix(at(100, 200)));
    s = reduceNav(s, r, fix(at(100, 250)));
    expect(s.moveAway).toBeGreaterThan(0);
    s = reduceNav(s, r, fix(at(200)));
    expect(s.moveAway).toBe(0);
    expect(s.phase).toBe("following");
  });

  it("arrives within 20 m of the end driving and 15 m walking", () => {
    expect(reduceNav(initialNav(), r, fix(at(882))).phase).toBe("arrived");
    expect(reduceNav(initialNav(), r, fix(at(870))).phase).toBe("following");
    const w = prepare(straight("walk"));
    expect(reduceNav(initialNav(), w, fix(at(882))).phase).toBe("following");
    expect(reduceNav(initialNav(), w, fix(at(888))).phase).toBe("arrived");
  });

  it("uses the 20 m radius on foot", () => {
    const w = prepare(straight("walk"));
    expect(reduceNav(initialNav(), w, fix(at(300, 25))).moveAway).toBe(1);
  });
});

describe("cameraFor", () => {
  const r = prepare(straight());
  const p = projectForward(r, fix(at(300)), 0);

  it("faces the GPS heading when moving, the road when stopped", () => {
    expect(
      cameraFor(r, p, fix(at(300), { speedMps: 10, headingDeg: 120 })).bearing,
    ).toBe(120);
    expect(
      cameraFor(r, p, fix(at(300), { speedMps: 0.5, headingDeg: 120 })).bearing,
    ).toBeCloseTo(90, 0);
  });

  it("tilts more driving than walking and zooms out with speed", () => {
    const slow = cameraFor(r, p, fix(at(300), { speedMps: 2 }));
    const fast = cameraFor(r, p, fix(at(300), { speedMps: 25 }));
    expect(slow.pitch).toBe(60);
    expect(fast.zoom).toBeLessThan(slow.zoom);
    const w = prepare(straight("walk"));
    expect(
      cameraFor(w, projectForward(w, fix(at(300)), 0), fix(at(300))).pitch,
    ).toBe(45);
  });
});

describe("reduceNav before the first match (heading to the route)", () => {
  const w = prepare(straight("walk"));

  it("a start near the route is an approach, not leaving it, even with GPS jitter", () => {
    let s = reduceNav(initialNav(), w, fix(at(-30, 10))); // 30 m before the start, at the door
    expect(s.phase).toBe("following");
    expect(s.approachM).toBeCloseTo(32, -1);
    for (let i = 0; i < 30; i++) {
      s = reduceNav(
        s,
        w,
        fix(at(-30 + (i % 3), 10 + (i % 2)), { speedMps: 0.4 }),
      );
    }
    expect(s.phase).toBe("following");
    expect(s.moveAway).toBe(0);
    s = reduceNav(s, w, fix(at(5)));
    expect(s.approachM).toBeNull();
    expect(s.projection).not.toBeNull();
  });

  it("a start far from the route counts as off it (reroute from where you are)", () => {
    let s = initialNav();
    for (let i = 0; i < 12; i++) s = reduceNav(s, w, fix(at(0, 500 + i * 10)));
    expect(s.phase).toBe("offRoute");
  });
});
