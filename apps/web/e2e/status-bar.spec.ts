import { expect, test } from "@playwright/test";

test("the home-screen app asks iOS for a translucent status bar, with no fade", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute("content", "black-translucent");
  await expect(page.locator("[data-status-fade]")).toHaveCount(0);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#eef3f7",
  );
});
