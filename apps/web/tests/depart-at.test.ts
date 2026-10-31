import { describe, expect, it } from "vitest";
import { clampDepart, departRange, nowInHakuba } from "@/lib/depart-at";

// T78: the bus "Leave after" box offered any date; 9999-12-31 made the API 500
describe("departRange", () => {
  it("runs from the start of today in Hakuba to a year ahead", () => {
    // 03:00 UTC is already noon in Hakuba
    expect(departRange(new Date("2026-11-01T03:00:00Z"))).toEqual({
      min: "2026-11-01T00:00",
      max: "2027-11-01T23:59",
    });
  });

  it("uses Hakuba's date, not the device's (late evening UTC is tomorrow there)", () => {
    expect(departRange(new Date("2026-11-01T20:00:00Z")).min).toBe(
      "2026-11-02T00:00",
    );
  });
});

describe("clampDepart", () => {
  const range = { min: "2026-11-01T00:00", max: "2027-11-01T23:59" };

  it("keeps a time inside the range", () => {
    expect(clampDepart("2027-01-15T08:00", range)).toBe("2027-01-15T08:00");
  });

  it("pulls far-off dates back to the range's ends", () => {
    expect(clampDepart("9999-12-31T23:59", range)).toBe(range.max);
    expect(clampDepart("0001-01-01T00:00", range)).toBe(range.min);
  });

  it("leaves an emptied box empty", () => {
    expect(clampDepart("", range)).toBe("");
  });
});

describe("nowInHakuba", () => {
  it("is the wall-clock time in Hakuba, to the minute", () => {
    expect(nowInHakuba(new Date("2026-11-01T03:04:59Z"))).toBe(
      "2026-11-01T12:04",
    );
  });
});
