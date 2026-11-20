import { expect, test } from "@playwright/test";

// docs/ux/google-maps-workflows.md T1: a readable sans-serif, light rounded surfaces, soft
// shadows and blue primary actions replace the pixel frames and font (SPEC-game-theme v2)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("the working interface has the Maps look, not the pixel look", async ({
  page,
}) => {
  await page.goto("/?from=36.6985,137.8376&mode=drive&resort=happo-one");
  await page
    .locator("main[data-map-loaded='true']:not([data-route-points='0'])")
    .waitFor({ timeout: 30_000 });

  const look = await page.evaluate(() => {
    const css = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const card = document.querySelector("[data-trip-header] > div");
    const sheet = document.querySelector("[data-sheet]");
    const start = [...document.querySelectorAll("button")].find((b) =>
      /^(Start|Preview route)/.test(b.textContent?.trim() ?? ""),
    );
    // the old frame: four 4 px ink shadows in rgb(34, 34, 58)
    const framed = [...document.querySelectorAll("body *")].filter((el) =>
      getComputedStyle(el).boxShadow.includes("rgb(34, 34, 58) 0px -4px"),
    ).length;
    return {
      font: css(document.body)?.fontFamily ?? "",
      cardRadius: Number.parseFloat(css(card)?.borderTopLeftRadius ?? "0"),
      sheetRadius: Number.parseFloat(css(sheet)?.borderTopLeftRadius ?? "0"),
      primary: getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
      // Tailwind v4 writes colours as lab(): read them back as rgb through a canvas pixel
      startBg: (() => {
        const c = document.createElement("canvas").getContext("2d");
        if (!c || !start) return "";
        c.fillStyle = getComputedStyle(start).backgroundColor;
        c.fillRect(0, 0, 1, 1);
        const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      })(),
      framed,
    };
  });

  expect(look.font).not.toMatch(/DotGothic/i);
  expect(look.cardRadius).toBeGreaterThanOrEqual(12);
  expect(look.sheetRadius).toBeGreaterThanOrEqual(12);
  expect(look.primary).toBe("#1967d2");
  expect(look.startBg).toBe("rgb(25, 103, 210)");
  expect(look.framed).toBe(0);
});
