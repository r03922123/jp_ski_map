import { describe, expect, it } from "vitest";
import { formatArrival, formatDistance, formatDuration } from "@/lib/format";

describe("formatDuration", () => {
  it("rounds to whole minutes, never below 1", () => {
    expect(formatDuration(172)).toBe("3 min");
    expect(formatDuration(20)).toBe("1 min");
  });

  it("switches to hours past 60 minutes", () => {
    expect(formatDuration(3900)).toBe("1 h 5 min");
    expect(formatDuration(7200)).toBe("2 h");
  });
});

describe("formatDistance", () => {
  it("uses metres under 1 km", () => {
    expect(formatDistance(837)).toBe("837 m");
  });

  it("uses one decimal of km from 1 km", () => {
    expect(formatDistance(2508)).toBe("2.5 km");
    expect(formatDistance(27400)).toBe("27.4 km");
  });
});

describe("formatArrival", () => {
  it("adds the duration to the departure, in Hakuba time", () => {
    const depart = new Date("2026-03-20T08:00:00+09:00");
    expect(formatArrival(depart, 172)).toBe("08:03");
    expect(formatArrival(depart, 57 * 60)).toBe("08:57");
  });

  it("wraps past midnight", () => {
    const depart = new Date("2026-03-20T23:50:00+09:00");
    expect(formatArrival(depart, 20 * 60)).toBe("00:10");
  });
});
