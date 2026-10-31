import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Resort } from "@/lib/api";
import { pixels } from "@/lib/game/render";
import {
  DIGITS,
  HERO,
  HERO_PALETTE,
  ICONS,
  mirror,
  POSE_FRAMES,
  type Sprite,
} from "@/lib/game/sprites";
import { worldNumbers } from "@/lib/game/worlds";

function expectValid(name: string, sprite: Sprite) {
  for (const [i, frame] of sprite.frames.entries()) {
    expect(frame, `${name}[${i}] height`).toHaveLength(sprite.h);
    for (const [r, row] of frame.entries()) {
      expect(row.length, `${name}[${i}] row ${r} width`).toBe(sprite.w);
      for (const ch of row) {
        if (ch !== ".")
          expect(sprite.palette, `${name}[${i}] '${ch}'`).toHaveProperty(ch);
      }
    }
  }
}

describe("hero sprite (SPEC-game-theme)", () => {
  it("has every pose with the spec's frame counts, 24×24", () => {
    expect(
      Object.fromEntries(
        Object.entries(HERO).map(([k, s]) => [k, s.frames.length]),
      ),
    ).toEqual(POSE_FRAMES);
    expect(POSE_FRAMES).toEqual({
      idle: 2,
      walk: 4,
      ride: 2,
      bus: 2,
      drive: 2,
    });
    for (const s of Object.values(HERO)) expect([s.w, s.h]).toEqual([24, 24]);
  });

  it.each(Object.entries(HERO))("%s frames are well formed", (name, sprite) => {
    expectValid(name, sprite);
  });

  it("frames of one pose differ (it animates) and nothing is blank", () => {
    for (const [name, s] of Object.entries(HERO)) {
      expect(new Set(s.frames.map((f) => f.join("\n"))).size, name).toBe(
        s.frames.length,
      );
      for (const f of s.frames)
        expect(f.join("").replaceAll(".", "").length).toBeGreaterThan(60);
    }
  });

  it("mirror flips left and right and is its own inverse", () => {
    expect(mirror(["ab.", "..c"])).toEqual([".ba", "c.."]);
    const f = HERO.walk.frames[0];
    expect(mirror(mirror(f))).toEqual(f);
  });

  it("uses the hero's look: beanie, goggles, orange jacket, teal board", () => {
    expect(HERO_PALETTE).toMatchObject({ o: "#f08a24", t: "#2bb3a3" });
    const idle = HERO.idle.frames[0].join("");
    for (const part of ["b", "g", "o", "t"]) expect(idle).toContain(part);
  });
});

describe("map icons", () => {
  it.each(Object.entries(ICONS))("%s is well formed", (name, sprite) => {
    expectValid(name, sprite);
  });

  it("has the icons the map needs", () => {
    expect(Object.keys(ICONS).sort()).toEqual(
      ["flag", "food", "konbini", "star", "stop", "world"].sort(),
    );
  });

  it("digits 0–9 are 3×5", () => {
    expect(Object.keys(DIGITS)).toHaveLength(10);
    for (const d of Object.values(DIGITS)) {
      expect(d).toHaveLength(5);
      for (const row of d) expect(row).toMatch(/^[#.]{3}$/);
    }
  });
});

describe("pixels()", () => {
  const sprite: Sprite = {
    w: 2,
    h: 1,
    palette: { a: "#ff0000" },
    frames: [["a."]],
  };

  it("scales each pixel to a block, transparent where '.'", () => {
    const img = pixels(sprite, 0, 2);
    expect([img.width, img.height]).toEqual([4, 2]);
    const at = (x: number, y: number) =>
      Array.from(img.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    expect(at(0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(1, 1)).toEqual([255, 0, 0, 255]);
    expect(at(2, 0)).toEqual([0, 0, 0, 0]);
  });

  it("mirrors on request", () => {
    const img = pixels(sprite, 0, 1, true);
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(img.data.slice(4, 8))).toEqual([255, 0, 0, 255]);
  });
});

describe("world numbers", () => {
  const resorts = JSON.parse(
    readFileSync("../../data/resorts.json", "utf8"),
  ) as Resort[];

  it("numbers every resort W1… north to south", () => {
    const w = worldNumbers(resorts);
    expect(w.size).toBe(resorts.length);
    expect(w.get("cortina")).toBe(1);
    expect(w.get("happo-one")).toBe(5);
    expect(w.get("jigatake")).toBe(resorts.length);
    expect(new Set(w.values()).size).toBe(resorts.length);
  });

  it("doesn't depend on the order resorts arrive in", () => {
    const shuffled = [...resorts].reverse();
    expect([...worldNumbers(shuffled)].sort()).toEqual(
      [...worldNumbers(resorts)].sort(),
    );
  });
});
