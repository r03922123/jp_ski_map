import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { facesLeft, Hero, heroPose } from "@/components/HeroMarker";

function reducedMotion(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: on && q.includes("reduce"),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Hero (SPEC-game-theme)", () => {
  it("animates its pose's frames", () => {
    reducedMotion(false);
    render(<Hero pose="walk" alt="Your position" />);
    const img = screen.getByRole("img", { name: "Your position" });
    expect(img).toHaveAttribute("data-pose", "walk");
    const seen = new Set([img.getAttribute("data-frame")]);
    for (let i = 0; i < 4; i++) {
      act(() => vi.advanceTimersByTime(200));
      seen.add(img.getAttribute("data-frame"));
    }
    expect(seen).toEqual(new Set(["0", "1", "2", "3"]));
  });

  it("holds still with reduced motion", () => {
    reducedMotion(true);
    render(<Hero pose="walk" alt="Your position" />);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("img")).toHaveAttribute("data-frame", "0");
  });
});

describe("heroPose", () => {
  it("follows the trip", () => {
    expect(heroPose({ mode: "drive", phase: "following" })).toBe("drive");
    expect(heroPose({ mode: "walk", phase: "following" })).toBe("walk");
    expect(heroPose({ mode: "drive", phase: "arrived" })).toBe("ride");
    expect(heroPose({ mode: "bus", phase: "following", bus: "walk" })).toBe(
      "walk",
    );
    expect(heroPose({ mode: "bus", phase: "following", bus: "wait" })).toBe(
      "idle",
    );
    expect(heroPose({ mode: "bus", phase: "following", bus: "ride" })).toBe(
      "bus",
    );
    expect(heroPose({ mode: "bus", phase: "arrived", bus: "arrived" })).toBe(
      "ride",
    );
  });
});

describe("facesLeft: travel direction on screen, never a rotation", () => {
  it("faces right when the map turns with you (heading up)", () => {
    expect(facesLeft(250, 250)).toBe(false);
  });
  it("on a north-up map, west-bound faces left, east-bound right", () => {
    expect(facesLeft(270, 0)).toBe(true);
    expect(facesLeft(90, 0)).toBe(false);
    expect(facesLeft(null, 0)).toBe(false);
  });
});
