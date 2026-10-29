import { describe, expect, it } from "vitest";
import { formatDistance, formatDuration } from "@/lib/format";

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
