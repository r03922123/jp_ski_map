import { expect, test } from "@playwright/test";

// SPEC-web-app v1.25: an ordinary status bar, so iOS neither shortens the page (the band) nor
// draws a white clock over the map (the blur)
test("the home-screen app asks iOS for an ordinary status bar, with no fade", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute("content", "default");
  await expect(page.locator("[data-status-fade]")).toHaveCount(0);
});
