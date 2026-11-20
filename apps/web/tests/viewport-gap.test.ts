import { describe, expect, it } from "vitest";
import { viewportGap } from "@/lib/safe-insets";

// v1.20: an iPhone home-screen app with a black-translucent status bar lays the page out
// one status bar shorter than the screen (owner's iPhone, 2026-11-20: a 47 pt band below)
describe("viewportGap", () => {
  const phone = { screenW: 390, screenH: 844, innerW: 390 };

  it("is the missing status-bar height when the viewport is that much short", () => {
    expect(viewportGap({ ...phone, innerH: 797, safeTop: 47 })).toBe(47);
  });

  it("is 0 when the viewport fills the screen", () => {
    expect(viewportGap({ ...phone, innerH: 844, safeTop: 47 })).toBe(0);
  });

  it("is 0 in a Safari tab, whose toolbars shorten the viewport but have no inset", () => {
    expect(viewportGap({ ...phone, innerH: 660, safeTop: 0 })).toBe(0);
  });

  it("never exceeds the status bar, whatever else shortens the viewport", () => {
    expect(viewportGap({ ...phone, innerH: 500, safeTop: 47 })).toBe(47);
  });

  it("compares landscape heights with the screen's short side", () => {
    expect(
      viewportGap({ ...phone, innerW: 844, innerH: 390, safeTop: 0 }),
    ).toBe(0);
    expect(
      viewportGap({ ...phone, innerW: 844, innerH: 370, safeTop: 20 }),
    ).toBe(20);
  });
});
