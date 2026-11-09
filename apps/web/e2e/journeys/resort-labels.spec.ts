import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * Journey: ONLY THE TRIP'S RESORT STAYS ON THE MAP (SPEC-web-app v1.12). The labels are
 * DOM markers, so counting them is what the user sees. Needs the API and Valhalla.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station
const START = `/?from=${STATION}&mode=drive`;
const TRIP = `${START}&resort=iwatake`;
const ALL = 10; // data/resorts.json
const MARCH_20 = readFileSync(
  "e2e/fixtures/bus-options-2026-03-20.json",
  "utf8",
);

const labels = (page: Page) => page.locator("[data-resort-marker]");
const label = (page: Page, id: string) =>
  page.locator(`[data-resort-marker='${id}']`);
const routeReady = (page: Page) =>
  expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({ timeout: 20_000 });
const swap = (page: Page) =>
  page.getByRole("button", { name: "Swap start and destination" }).click();

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
}

for (const device of [
  { name: "phone", width: 390, height: 699, touch: true },
  { name: "laptop", width: 1280, height: 720, touch: false },
]) {
  test.describe(device.name, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: device.touch,
      hasTouch: device.touch,
    });

    test("every label shows until both ends are set", async ({ page }) => {
      await open(page, "/?mode=drive");
      await expect(labels(page)).toHaveCount(ALL);
      await open(page, START);
      await expect(labels(page)).toHaveCount(ALL);
    });

    test("with a trip set, only its resort keeps its label and number", async ({
      page,
    }) => {
      await open(page, START);
      await expect(labels(page)).toHaveCount(ALL);
      const badge = label(page, "iwatake").locator("img");
      const before = await badge.getAttribute("src");

      await open(page, TRIP);
      await routeReady(page);

      await expect(labels(page)).toHaveCount(1);
      await expect(label(page, "iwatake")).toBeVisible();
      expect(await badge.getAttribute("src")).toBe(before);
    });

    test("a destination that isn't a resort leaves no label", async ({
      page,
    }) => {
      await open(page, `${START}&dest=pt:36.71000,137.86000`);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(0);
    });

    test("a place replacing a selected resort leaves no label", async ({
      page,
    }) => {
      await open(page, `${TRIP}&dest=pt:36.71000,137.86000`);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(0);

      await page.getByRole("button", { name: "Remove destination" }).click();

      await expect(labels(page)).toHaveCount(ALL);
    });

    test("a nearby place replacing a selected resort leaves no label", async ({
      page,
    }) => {
      await open(page, `${TRIP}&cat=food`);
      await page
        .getByRole("list", { name: "Nearby places" })
        .getByRole("button")
        .first()
        .click({ timeout: 15_000 });
      await routeReady(page);

      await expect(labels(page)).toHaveCount(0);
    });

    test("a resort reached through Saved keeps its label", async ({ page }) => {
      await open(page, TRIP);
      await routeReady(page);
      await page.getByRole("button", { name: /^Save Hakuba Iwatake/ }).click();
      await page.getByRole("checkbox", { name: /Starred/ }).check();
      await page.getByRole("button", { name: "Done" }).click();
      await expect
        .poll(() => page.evaluate(() => history.state?.overlay === true))
        .toBe(false);

      await open(page, `${START}&dest=pt:36.71705,137.85862`);
      await routeReady(page);

      await expect(labels(page)).toHaveCount(1);
      await expect(label(page, "iwatake")).toBeVisible();
    });

    test("clearing the start brings every label back", async ({ page }) => {
      await open(page, TRIP);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(1);

      await page.getByRole("button", { name: "Remove starting point" }).click();

      await expect(labels(page)).toHaveCount(ALL);
    });

    test("clearing the destination brings every label back", async ({
      page,
    }) => {
      await open(page, TRIP);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(1);

      await page.getByRole("button", { name: "Remove destination" }).click();

      await expect(labels(page)).toHaveCount(ALL);
    });

    test("the way back leaves no label, and a second swap restores it", async ({
      page,
    }) => {
      await open(page, TRIP);
      await routeReady(page);

      await swap(page);
      await expect
        .poll(() => new URL(page.url()).searchParams.get("dest"))
        .toBe(`pt:${STATION}`);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(0);

      await swap(page);
      await expect(labels(page)).toHaveCount(1);
      await expect(label(page, "iwatake")).toBeVisible();
    });

    test("an open stop box shows every label again", async ({ page }) => {
      await open(page, TRIP);
      await routeReady(page);
      await expect(labels(page)).toHaveCount(1);

      await page.getByRole("button", { name: "Add destination" }).click();

      await expect(labels(page)).toHaveCount(ALL);
    });

    test("bus: every label until a bus is chosen, then only its resort", async ({
      page,
    }) => {
      await page.route("**/api/bus/options**", (route) =>
        route.fulfill({ contentType: "application/json", body: MARCH_20 }),
      );
      await open(page, "/?from=36.69711,137.85393&mode=bus");
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");
      await expect(labels(page)).toHaveCount(ALL);

      await page
        .getByRole("region", { name: "Hakuba47 Mountain Resort" })
        .getByText("08:11 → 08:39")
        .click({ timeout: 15_000 });

      await expect(labels(page)).toHaveCount(1);
      await expect(label(page, "hakuba47")).toBeVisible();
    });

    test("bus: ticking Night bus brings every label back", async ({ page }) => {
      await page.route("**/api/bus/options**", (route) =>
        route.fulfill({ contentType: "application/json", body: MARCH_20 }),
      );
      await open(page, "/?from=36.69711,137.85393&mode=bus");
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");
      await page
        .getByRole("region", { name: "Hakuba47 Mountain Resort" })
        .getByText("08:11 → 08:39")
        .click({ timeout: 15_000 });
      await expect(labels(page)).toHaveCount(1);

      await page.getByLabel(/Night bus/).check();

      await expect(labels(page)).toHaveCount(ALL);
    });

    test("bus to a lodging leaves no label, until it's cleared", async ({
      page,
    }) => {
      await open(page, `/?from=36.65,137.84&mode=bus&dest=pt:${STATION}`);
      await expect(page.getByText("Shuttles to resorts")).toBeVisible({
        timeout: 15_000,
      });
      await expect(labels(page)).toHaveCount(0);

      await page.getByRole("button", { name: "Shuttles to resorts" }).click();

      await expect(labels(page)).toHaveCount(ALL);
    });
  });
}
