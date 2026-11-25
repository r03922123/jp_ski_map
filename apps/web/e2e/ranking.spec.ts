import { expect, test } from "@playwright/test";

const HOTEL_HAKUBA = "/?from=36.69711,137.85393&mode=walk";

test("walk mode ranks every resort and re-sorts on demand", async ({
  page,
}) => {
  await page.goto(HOTEL_HAKUBA);
  const list = page.getByRole("list", { name: "Ranked resorts" });
  await expect(list.getByRole("listitem")).toHaveCount(10, { timeout: 20_000 });

  // default: nearest first, every ETA labelled as an estimate
  await expect(list.getByRole("listitem").first()).toContainText("~ ");

  await page.getByLabel("Sort by").selectOption("terrain_size");
  await expect(page).toHaveURL(/sort=terrain_size/);
  // the longest total runs: Happo-One 23.3 km, then Tsugaike 20.5 km (only 11 runs)
  await expect(list.getByRole("listitem").nth(0)).toContainText("Happo-One");
  await expect(list.getByRole("listitem").nth(1)).toContainText("Tsugaike");

  // only Happo-One is within a 30 min walk of the hotel (~19 min)
  await page.getByLabel("Max walk").selectOption("30");
  await expect(page).toHaveURL(/maxWalk=30/);
  await expect.poll(() => list.getByRole("listitem").count()).toBeLessThan(10);
  await expect(list.getByRole("listitem").first()).toContainText("Happo-One");
});

test("choosing a ranked resort draws its walk route", async ({ page }) => {
  await page.goto(HOTEL_HAKUBA);

  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Tsugaike/ })
    .click({ timeout: 20_000 });

  await expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-route-points",
    "0",
  );
  await expect(page).toHaveURL(/resort=tsugaike/);
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "Open-Meteo",
  );
});
