import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { GAME_COLORS, gameStyle } from "@/lib/game/map-style";

// a few layers named like OpenFreeMap "liberty" (the real style has 111)
const base = {
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://x.test/tiles" } },
  glyphs: "https://x.test/{fontstack}/{range}.pbf",
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f8f4f0" },
    },
    {
      id: "water",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "water",
      paint: { "fill-color": "rgb(158,189,255)" },
    },
    {
      id: "landcover_wood",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["==", "class", "wood"],
      paint: { "fill-color": "hsla(98,61%,72%,0.7)", "fill-opacity": 0.4 },
    },
    {
      id: "building",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "building",
      paint: { "fill-color": "#e0d6cc" },
    },
    {
      id: "road_motorway_casing",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#e9ac77",
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 20, 30],
      },
    },
    {
      id: "road_motorway",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#fc8", "line-width": 2 },
    },
    {
      id: "road_minor",
      type: "line",
      source: "openmaptiles",
      "source-layer": "transportation",
      paint: { "line-color": "#fff", "line-width": 1 },
    },
    {
      id: "label_town",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "place",
      layout: { "text-field": "{name}", "text-font": ["Noto Sans Regular"] },
      paint: {
        "text-color": "#333",
        "text-halo-color": "#fff",
        "text-halo-width": 1,
      },
    },
  ],
} as unknown as StyleSpecification;

describe("gameStyle (SPEC-game-theme)", () => {
  const out = gameStyle(base);

  it("keeps every layer, source, filter and layout: only paint changes", () => {
    expect(out.sources).toEqual(base.sources);
    expect(out.glyphs).toBe(base.glyphs);
    expect(out.layers.map((l) => l.id)).toEqual(base.layers.map((l) => l.id));
    out.layers.forEach((l, i) => {
      const { paint: _a, ...rest } = l as { paint?: unknown };
      const { paint: _b, ...was } = base.layers[i] as { paint?: unknown };
      expect(rest).toEqual(was);
    });
  });

  it("paints the snowy overworld", () => {
    const paint = (id: string) =>
      (
        out.layers.find((l) => l.id === id) as unknown as {
          paint: Record<string, unknown>;
        }
      ).paint;
    expect(paint("background")["background-color"]).toBe(GAME_COLORS.snow);
    expect(paint("water")["fill-color"]).toBe(GAME_COLORS.water);
    expect(paint("landcover_wood")["fill-color"]).toBe(GAME_COLORS.forest);
    expect(paint("building")["fill-color"]).toBe(GAME_COLORS.wood);
    expect(paint("road_motorway_casing")["line-color"]).toBe(
      GAME_COLORS.outline,
    );
    expect(paint("road_motorway")["line-color"]).toBe(GAME_COLORS.motorway);
    expect(paint("road_minor")["line-color"]).toBe(GAME_COLORS.lane);
    expect(paint("label_town")).toMatchObject({
      "text-color": GAME_COLORS.label,
      "text-halo-color": GAME_COLORS.outline,
    });
  });

  it("keeps zoom-dependent widths (only colours are replaced)", () => {
    const casing = out.layers.find((l) => l.id === "road_motorway_casing") as {
      paint: Record<string, unknown>;
    };
    expect(casing.paint["line-width"]).toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      0.4,
      20,
      30,
    ]);
  });

  it("doesn't touch the input", () => {
    expect(
      (base.layers[0] as unknown as { paint: Record<string, string> }).paint[
        "background-color"
      ],
    ).toBe("#f8f4f0");
  });
});
