import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, TEXT_PAIRS, TOKENS, UI_PAIRS } from "@/lib/game/tokens";

describe("game theme tokens (SPEC-game-theme)", () => {
  it("contrast() follows WCAG 2.x", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it.each(TEXT_PAIRS)("%s on %s is at least 4.5:1", (text, bg) => {
    expect(contrast(TOKENS[text], TOKENS[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)("focus ring %s on %s is at least 3:1", (ui, bg) => {
    expect(contrast(TOKENS[ui], TOKENS[bg])).toBeGreaterThanOrEqual(3);
  });

  it("globals.css uses exactly these values", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const root = css.slice(
      css.indexOf(":root {"),
      css.indexOf("}", css.indexOf(":root {")),
    );
    for (const [name, hex] of Object.entries(TOKENS)) {
      expect(root, `--${name}`).toContain(`--${name}: ${hex};`);
    }
  });
});
