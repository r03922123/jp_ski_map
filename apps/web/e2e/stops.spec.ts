import { expect, type Page, test } from "@playwright/test";

// SPEC-web-app v1.4: add a stop by typing or by tapping the map; remove it; share it.
const DRIVE = "/?from=36.69711,137.85393&mode=drive&resort=happo-one";
const steps = (page: Page) => page.getByRole("list", { name: "Steps" });

async function loaded(page: Page) {
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(steps(page)).toBeVisible({ timeout: 20_000 });
}

/** Show every step (the list collapses after five). */
async function allSteps(page: Page) {
  const more = page.getByRole("button", { name: /Show all \d+ steps/ });
  if (await more.isVisible()) await more.click();
  return steps(page).innerText();
}

test("add a stop by typing: the route goes through it, and the link keeps it", async ({
  page,
}) => {
  await page.goto(DRIVE);
  await loaded(page);
  expect(await allSteps(page)).not.toContain("Arrive at stop 1");

  await page.getByRole("button", { name: "Add stop" }).click();
  const box = page.getByRole("combobox", { name: "Stop 1" });
  await expect(box).toBeFocused();
  await box.fill("7-Eleven");
  await page
    .getByRole("option", { name: /7-Eleven/ })
    .first()
    .click({ timeout: 15_000 });

  const trip = page.getByRole("list", { name: "Trip" });
  await expect(trip.getByRole("listitem")).toHaveCount(3);
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toContain("Arrive at stop 1");
  await expect(page).toHaveURL(/stops=36\.\d+%2C137\.\d+/);
  await expect(page.locator('[data-trip-stop="1"]')).toBeVisible();

  // the shared link brings the stop back
  await page.reload();
  await loaded(page);
  await expect(
    page.getByRole("list", { name: "Trip" }).getByRole("listitem"),
  ).toHaveCount(3);
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toContain("Arrive at stop 1");
});

test("add a stop by tapping the map, then remove it", async ({ page }) => {
  await page.goto(DRIVE);
  await loaded(page);
  await page.getByRole("button", { name: "Add stop" }).click();
  await expect(page.getByText(/or tap the map/i)).toBeVisible();

  // tap the middle of the drawn route: on screen, and on a road
  const at = await page.evaluate(() => {
    type F = { geometry: { coordinates: [number, number][] } };
    const map = (
      window as unknown as {
        __hakubaMap: {
          queryRenderedFeatures(o: { layers: string[] }): F[];
          project(c: [number, number]): { x: number; y: number };
          getCanvas(): HTMLCanvasElement;
        };
      }
    ).__hakubaMap;
    const line = map.queryRenderedFeatures({
      layers: ["route-active-line"],
    })[0];
    const cs = line.geometry.coordinates;
    const p = map.project(cs[Math.floor(cs.length / 2)]);
    const r = map.getCanvas().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  });
  await page.mouse.click(at.x, at.y);

  const trip = page.getByRole("list", { name: "Trip" });
  await expect(trip).toContainText("Stop 1");
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toContain("Arrive at stop 1");
  // the tap filled the stop: the starting point didn't move
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);

  await page.getByRole("button", { name: "Remove stop 1" }).click();
  await expect(trip.getByRole("listitem")).toHaveCount(2);
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .not.toContain("Arrive at stop");
  await expect(page).not.toHaveURL(/stops=/);
});

test("the bus tab offers no stops (a shuttle can't detour)", async ({
  page,
}) => {
  await page.goto("/?from=36.69711,137.85393&mode=bus");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Add stop" })).toHaveCount(0);
});
