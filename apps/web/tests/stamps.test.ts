import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Resort } from "@/lib/api";
import { emptyRider } from "@/lib/game/rider";
import {
  ARRIVE_M,
  arrivedAt,
  CHECK_IN_ACCURACY_M,
  CHECK_IN_M,
  checkIn,
  jstDate,
  MAX_VISITS,
  recordVisit,
} from "@/lib/game/stamps";

const resorts = JSON.parse(
  readFileSync("../../data/resorts.json", "utf8"),
) as Resort[];
const happo = resorts.find((r) => r.id === "happo-one") as Resort;
const base = happo.accessPoints[0].coord;
/** a point `m` metres north of the base */
const north = (m: number) => ({ lat: base.lat + m / 111_195, lng: base.lng });

describe("stamps (SPEC-progression)", () => {
  it("dates are Japan's calendar day", () => {
    expect(jstDate(new Date("2026-01-01T14:59:00Z"))).toBe("2026-01-01");
    expect(jstDate(new Date("2026-01-01T15:00:00Z"))).toBe("2026-01-02"); // midnight JST
  });

  it(`arrival within ${ARRIVE_M} m of an access point is at that resort; 200 m isn't`, () => {
    expect(arrivedAt(resorts, north(140))?.id).toBe("happo-one");
    expect(arrivedAt(resorts, north(200))).toBeNull();
  });

  it(`check in: ≤ ${CHECK_IN_M} m with accuracy ≤ ${CHECK_IN_ACCURACY_M} m counts`, () => {
    expect(checkIn(happo, { coord: north(290), accuracyM: 50 })).toEqual({
      ok: true,
    });
    expect(checkIn(happo, { coord: north(2400), accuracyM: 20 })).toEqual({
      ok: false,
      reason: "far",
      distanceM: expect.closeTo(2400, -1),
    });
    expect(checkIn(happo, { coord: north(10), accuracyM: 150 })).toEqual({
      ok: false,
      reason: "inaccurate",
    });
  });

  it("the first visit earns the stamp; later visits, one per day", () => {
    const day1 = recordVisit(emptyRider(), "happo-one", "2026-01-02");
    expect(day1.stamped).toBe(true);
    expect(day1.state.stamps["happo-one"]).toEqual({
      resortId: "happo-one",
      firstAt: "2026-01-02",
      visits: ["2026-01-02"],
    });
    const again = recordVisit(day1.state, "happo-one", "2026-01-02");
    expect(again).toEqual({
      state: day1.state,
      stamped: false,
      visited: false,
    });
    const day2 = recordVisit(day1.state, "happo-one", "2026-01-03");
    expect(day2.stamped).toBe(false);
    expect(day2.visited).toBe(true);
    expect(day2.state.stamps["happo-one"].visits).toEqual([
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it(`keeps at most ${MAX_VISITS} visits`, () => {
    let s = emptyRider();
    for (let d = 1; d <= MAX_VISITS + 5; d++) {
      s = recordVisit(
        s,
        "happo-one",
        `2026-${String(Math.ceil(d / 28)).padStart(2, "0")}-${String(((d - 1) % 28) + 1).padStart(2, "0")}`,
      ).state;
    }
    expect(s.stamps["happo-one"].visits).toHaveLength(MAX_VISITS);
    expect(s.stamps["happo-one"].firstAt).toBe("2026-01-01");
  });
});
