import { expect, type Page, test } from "@playwright/test";

// T78: the search box's hint was cut off mid-word on phones ("…or paste a").
async function clippedPlaceholders(page: Page) {
  return page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("no canvas");
    const out: string[] = [];
    for (const input of document.querySelectorAll<HTMLInputElement>(
      "input[placeholder]",
    )) {
      if (input.offsetParent === null) continue;
      const cs = getComputedStyle(input);
      ctx.font = cs.font;
      const room =
        input.clientWidth -
        Number.parseFloat(cs.paddingLeft) -
        Number.parseFloat(cs.paddingRight);
      const needs = ctx.measureText(input.placeholder).width;
      if (needs > room) {
        out.push(
          `"${input.placeholder}" needs ${Math.ceil(needs)}px of ${room}`,
        );
      }
    }
    return out;
  });
}

async function openTripWithStopBox(page: Page) {
  await page.goto("/?from=36.69400,137.86900&mode=walk&resort=happo-one");
  await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Add stop" }).click();
}

test.describe("phone", () => {
  test.use({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  });
  test("hints fit their boxes", async ({ page }) => {
    await openTripWithStopBox(page);
    expect(await clippedPlaceholders(page)).toEqual([]);
  });
});

test("desktop: hints fit their boxes", async ({ page }) => {
  await openTripWithStopBox(page);
  expect(await clippedPlaceholders(page)).toEqual([]);
});
