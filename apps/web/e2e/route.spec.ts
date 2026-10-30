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

  // Drive mode lists ranked resorts (map markers share the name, so scope to the list)
  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Happo-One/ })
    .click({ timeout: 15_000 });
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

// Happo village → Iwatake: Valhalla offers one alternate here (recorded 2026-10-30).
const WITH_ALTERNATE = "/?from=36.6985,137.8376&mode=drive&resort=iwatake";

test("drive route is fitted, labelled, and alternates can be chosen", async ({
  page,
}) => {
  await page.goto(WITH_ALTERNATE);
  const main = page.locator("main[data-map-loaded='true']");
  await expect(main).toBeAttached({ timeout: 15_000 });
  await expect(main).toHaveAttribute("data-route-layers", /primary,alternate/, {
    timeout: 15_000,
  });

  const selected = page.locator("[data-route-label='active']");
  const alternate = page.locator("[data-route-label='alternate']");
  await expect(selected).toHaveText(/\d+ min/);
  await expect(alternate).toHaveText(/\d+ min/);
  await expect(page.getByRole("img", { name: "Destination" })).toBeVisible();

  // the map is fitted to the whole route: both ends are on screen
  const start = await page
    .getByRole("img", { name: "Starting point" })
    .boundingBox();
  const end = await page
    .getByRole("img", { name: "Destination" })
    .boundingBox();
  const viewport = page.viewportSize();
  if (!start || !end || !viewport) throw new Error("markers not laid out");
  for (const box of [start, end]) {
    expect(box.x).toBeGreaterThan(0);
    expect(box.y).toBeGreaterThan(0);
    expect(box.x + box.width).toBeLessThan(viewport.width);
    expect(box.y + box.height).toBeLessThan(viewport.height);
  }

  const before = await selected.textContent();
  await alternate.click();
  await expect(main).toHaveAttribute("data-route-layers", "alternate,primary");
  await expect(selected).not.toHaveText(before ?? "");
});
