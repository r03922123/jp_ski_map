import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LODGING_LAYER } from "@/components/map/LodgingLayer";
import {
  LIFT_COLOR,
  runColor,
  SKI_LAYERS,
  SkiLinesLayer,
} from "@/components/map/SkiLinesLayer";

vi.mock("react-map-gl/maplibre", () => ({
  Source: (p: { children?: ReactNode }) => <div>{p.children}</div>,
  Layer: ({ id, ...rest }: { id: string }) => (
    <i data-layer={id} data-style={JSON.stringify(rest)} />
  ),
}));

const GREEN = "hsl(125,100%,33%)";
const RED = "hsl(359,94%,53%)";
const ORANGE = "hsl(34,100%,50%)";

describe("run colours (SPEC-ski-runs, Japan convention)", () => {
  it.each([
    ["novice", GREEN],
    ["easy", GREEN],
    ["intermediate", RED],
    ["advanced", "#000000"],
    ["expert", "#000000"],
    ["freeride", ORANGE],
    ["extreme", ORANGE],
    [null, "hsl(0,0%,35%)"],
  ])("%s is %s", (difficulty, colour) => {
    expect(runColor(difficulty)).toBe(colour);
  });

  it("the run layer draws from the same table, grey when unknown", () => {
    const { container } = render(<SkiLinesLayer selectedId={null} />);
    const style = (id: string) =>
      JSON.parse(
        container
          .querySelector(`[data-layer="${id}"]`)
          ?.getAttribute("data-style") ?? "{}",
      );
    const match = style("ski-runs").paint["line-color"];
    expect(match.slice(0, 2)).toEqual(["match", ["get", "difficulty"]]);
    expect(match.at(-1)).toBe(runColor(null));
    for (let i = 2; i < match.length - 1; i += 2)
      expect(match[i + 1]).toBe(runColor(match[i]));
    expect(style("ski-lifts").paint["line-color"]).toBe(LIFT_COLOR);
  });

  it("every layer sits under the lodging pins, lines from zoom 10, names from 14", () => {
    const { container } = render(<SkiLinesLayer selectedId={null} />);
    const layers = [...container.querySelectorAll("[data-layer]")].map(
      (el) => ({
        id: el.getAttribute("data-layer"),
        ...JSON.parse(el.getAttribute("data-style") ?? "{}"),
      }),
    );
    expect(layers.map((l) => l.id)).toEqual(SKI_LAYERS);
    for (const l of layers) expect(l.beforeId).toBe(LODGING_LAYER);
    expect(layers.map((l) => l.minzoom)).toEqual([10, 10, 10, 10, 14, 10]);
  });
});
