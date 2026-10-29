import { expect, test } from "@playwright/test";

// Needs the API (started by playwright.config) and Valhalla (docker compose) running.
test("click map → choose resort → drive then walk route with ETA", async ({
  page,
}) => {
  await page.goto("/");
  const main = page.locator("main[data-map-loaded='true']");
  await expect(main).toBeAttached({ timeout: 15_000 });

  // Hakuba village, a little south-east of the initial centre (away from resort markers)
  const canvas = page.locator("canvas.maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("map canvas has no size");
  await page.mouse.click(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 + 40,
  );
  await expect(page.getByRole("img", { name: "Starting point" })).toBeVisible();

  await page.getByLabel("Resort", { exact: true }).selectOption("happo-one");
  await expect(page.getByText(/^ETA ~ \d+ min/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(main).not.toHaveAttribute("data-route-points", "0");
  const drivePoints = await main.getAttribute("data-route-points");

  await page.getByRole("tab", { name: /walk/i }).click();
  await expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({ timeout: 10_000 });
  await expect(main).not.toHaveAttribute(
    "data-route-points",
    drivePoints ?? "",
  );
});
