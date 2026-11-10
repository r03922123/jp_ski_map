import { expect, test } from "@playwright/test";

// SPEC-game-theme v1.6: the overworld's look, in a real browser (v1.14: no sound).

test("the map is the overworld: the idle rider stands at the start", async ({
  page,
}) => {
  await page.goto("/?from=36.69711,137.85393&mode=drive");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("img", { name: "Starting point" }),
  ).toHaveAttribute("data-pose", "idle");
  // every resort chip carries its world badge
  await expect(page.locator("[data-resort-marker] img").first()).toBeVisible();
});
