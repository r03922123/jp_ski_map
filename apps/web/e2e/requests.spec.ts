import { expect, test } from "@playwright/test";

// T78: the resort catalogue is static; one load fetches it once, however many parts
// of the app (map, ranked list, quests, rider card) read it, and whenever they mount
test("the resort catalogue is fetched once per visit", async ({ page }) => {
  let fetches = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/resorts") fetches++;
  });
  await page.goto("/?from=36.6985,137.8376&mode=drive");
  await expect(page.getByRole("list", { name: "Ranked resorts" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /^Quests/ }).click();
  await page.getByRole("button", { name: /^Rider card/ }).click();
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Quests/ }).click(); // its popover covers the tabs
  await page.getByRole("tab", { name: /walk/i }).click();
  await page.waitForTimeout(500);

  expect(fetches).toBe(1);
});
