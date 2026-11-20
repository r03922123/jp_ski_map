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

test("the home-screen status bar has a solid, non-interactive background", async ({
  page,
}) => {
  await page.goto("/");
  await page.addStyleTag({ content: ":root { --safe-top: 47px }" });
  const statusBar = () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body, "::after");
      return {
        content: style.content,
        position: style.position,
        height: style.height,
        color: style.backgroundColor,
        pointerEvents: style.pointerEvents,
      };
    });
  expect((await statusBar()).content).toBe("none");
  // Activate the shipped rules in this tab. Chromium cannot launch the iOS web app.
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      if (sheet.href && new URL(sheet.href).origin !== location.origin)
        continue;
      for (const rule of sheet.cssRules) {
        if (
          rule instanceof CSSMediaRule &&
          rule.conditionText === "(display-mode: standalone)"
        ) {
          rule.media.mediaText = "all";
        }
      }
    }
  });
  expect(await statusBar()).toEqual({
    content: '""',
    position: "fixed",
    height: "47px",
    color: "rgb(238, 243, 247)",
    pointerEvents: "none",
  });
});
