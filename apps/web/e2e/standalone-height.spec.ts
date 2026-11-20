import { expect, test } from "@playwright/test";

// SPEC-web-app v1.28: iOS 26+ lays a home-screen app out one top inset short of the screen
// and draws nothing below that edge (WebKit 301108). A root element taller by the top inset
// makes iOS size the page to the whole screen (measured on the owner's iPhone: 797 → 844).
// Chromium can't emulate display-mode: standalone, so this checks the rule ships.
test("home-screen mode grows the root by the top inset, capped at the screen", async ({
  page,
}) => {
  await page.goto("/");
  const rules = await page.evaluate(() =>
    [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules]
          .filter(
            (r): r is CSSMediaRule =>
              r instanceof CSSMediaRule &&
              r.conditionText.includes("display-mode: standalone"),
          )
          .flatMap((r) => [...r.cssRules].map((inner) => inner.cssText));
      } catch {
        return [];
      }
    }),
  );
  const css = rules.join("\n");
  const value = css.match(/html\s*\{\s*min-height:\s*([^;]+);\s*\}/)?.[1];
  expect(value).toBe("min(100lvh, calc(100% + env(safe-area-inset-top)))");
  // env() values are stored unchecked; with the inset filled in, the browser must accept it
  // (a typo would make iOS drop the rule silently)
  const valid = await page.evaluate(
    (v) =>
      CSS.supports("min-height", v.replace("env(safe-area-inset-top)", "47px")),
    value ?? "",
  );
  expect(valid).toBe(true);
});
