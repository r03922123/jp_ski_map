import { beforeEach, describe, expect, it } from "vitest";
import {
  dueAnnouncement,
  loadMuted,
  MUTE_KEY,
  saveMuted,
} from "@/lib/nav/announce";
import type { Guidance } from "@/lib/nav/progress";

function guidance(distanceM: number, stepIndex = 2): Guidance {
  return {
    remainingM: 2000,
    remainingS: 300,
    stepIndex: stepIndex - 1,
    next: {
      stepIndex,
      maneuver: "left",
      instruction: "Turn left onto Route 33.",
      streetNames: ["Route 33"],
      distanceM,
    },
    after: null,
  };
}

describe("dueAnnouncement", () => {
  it("drives: once at 500 m, once at 100 m", () => {
    const said = new Set<string>();
    expect(dueAnnouncement(guidance(800), "drive", said)).toBeNull();
    const far = dueAnnouncement(guidance(480), "drive", said);
    expect(far?.text).toBe("In 500 metres, turn left onto Route 33.");
    expect(dueAnnouncement(guidance(470), "drive", said)).toBeNull(); // not twice
    expect(dueAnnouncement(guidance(90), "drive", said)?.text).toBe(
      "Turn left onto Route 33.",
    );
    expect(dueAnnouncement(guidance(40), "drive", said)).toBeNull();
  });

  it("a jump past several thresholds speaks once, the nearest", () => {
    const said = new Set<string>();
    expect(dueAnnouncement(guidance(80), "drive", said)?.text).toBe(
      "Turn left onto Route 33.",
    );
    expect(dueAnnouncement(guidance(70), "drive", said)).toBeNull();
  });

  it("walks: at 50 m and at the turn; a new step starts fresh", () => {
    const said = new Set<string>();
    expect(dueAnnouncement(guidance(45), "walk", said)?.text).toBe(
      "In 50 metres, turn left onto Route 33.",
    );
    expect(dueAnnouncement(guidance(8), "walk", said)?.text).toBe(
      "Turn left onto Route 33. Now.",
    );
    expect(dueAnnouncement(guidance(45, 3), "walk", said)).not.toBeNull();
  });

  it("announces the arrival", () => {
    const said = new Set<string>();
    const g = guidance(45);
    if (!g.next) throw new Error("no next maneuver");
    g.next = {
      ...g.next,
      maneuver: "arrive",
      instruction: "Your destination is on the right.",
    };
    expect(dueAnnouncement(g, "walk", said)?.text).toBe(
      "In 50 metres, your destination is on the right.",
    );
  });
});

describe("mute", () => {
  beforeEach(() => localStorage.clear());

  it("is remembered on this device", () => {
    expect(loadMuted()).toBe(false);
    saveMuted(true);
    expect(localStorage.getItem(MUTE_KEY)).toBe("1");
    expect(loadMuted()).toBe(true);
  });
});
