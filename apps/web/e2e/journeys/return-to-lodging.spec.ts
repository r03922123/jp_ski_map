import { readFileSync } from "node:fs";
import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * Journey: BACK TO THE LODGING (SPEC-web-app v1.10). After skiing, one tap turns
 * "lodging → resort" into "resort → lodging". Needs the API and Valhalla running.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station stands in for the lodging
const TRIP = `/?from=${STATION}&mode=drive&resort=happo-one`;
const SWAP = "Swap start and destination";
const BUS_HINT = "Way back from a resort: use Drive or Walk.";
const MARCH_20 = readFileSync(
  "e2e/fixtures/bus-options-2026-03-20.json",
  "utf8",
);

const DEVICES = [
  {
    name: "phone 393x852",
    use: {
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    },
  },
  { name: "laptop 1440x900", use: { viewport: { width: 1440, height: 900 } } },
];

const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);
const isRoutes = (r: Request) => /\/api\/routes\?/.test(r.url());
const coordOf = (r: Request, name: string) =>
  new URL(r.url()).searchParams.get(name);
const swapButton = (page: Page) => page.getByRole("button", { name: SWAP });
const routeReady = (page: Page) =>
  expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({ timeout: 20_000 });

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("one tap routes from the resort back to the start", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      // only the reversed request: a late ranking can re-send the forward trip
      const reversed = page.waitForRequest(
        (r) => isRoutes(r) && coordOf(r, "to") === STATION,
      );
      await swapButton(page).click();
      const request = await reversed;

      expect(coordOf(request, "from")).not.toBe(STATION);
      await routeReady(page);

      await expect(page.getByRole("combobox", { name: "To" })).toHaveValue(
        "Dropped pin",
      );
      await expect(
        page.getByRole("combobox", { name: "Search hotel or place" }),
      ).toHaveValue(/Happo-One/);
      expect(param(page, "dest")).toBe(`pt:${STATION}`);
      expect(param(page, "resort")).toBeNull();
    });

    test("a second tap restores the resort as the destination", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      await swapButton(page).click();
      await expect.poll(() => param(page, "dest")).toBe(`pt:${STATION}`);
      await routeReady(page);
      await swapButton(page).click();

      await expect.poll(() => param(page, "resort")).toBe("happo-one");
      expect(param(page, "dest")).toBeNull();
      expect(param(page, "from")).toBe(STATION);
      await expect(page.getByRole("combobox", { name: "To" })).toHaveValue(
        /Happo-One/,
      );
    });

    test("stops are visited in the opposite order", async ({ page }) => {
      const near = "36.70000,137.86000";
      const far = "36.69000,137.85500";
      await page.goto(`${TRIP}&stops=${near};${far}`);
      await routeReady(page);

      const middleOf = (r: Request) =>
        (r.postDataJSON().points as { lat: number; lng: number }[])
          .slice(1, -1)
          .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
      const reversed = page.waitForRequest(
        (r) => /\/api\/route\/path/.test(r.url()) && middleOf(r)[0] === far,
      );
      await swapButton(page).click();

      expect(middleOf(await reversed)).toEqual([far, near]);
    });

    test("the start box follows a swap after it was retyped", async ({
      page,
    }) => {
      const from = page.getByRole("combobox", {
        name: "Search hotel or place",
      });
      const to = page.getByRole("combobox", { name: "To" });
      await page.goto(TRIP);
      await routeReady(page);
      await swapButton(page).click();
      await expect.poll(() => param(page, "dest")).toBe(`pt:${STATION}`);

      await from.fill("Hakuba Station");
      await page
        .getByRole("option", { name: /Station/ })
        .first()
        .click();
      await to.fill("Happo-One");
      await page
        .getByRole("option", { name: /Happo-One/ })
        .first()
        .click();
      await expect.poll(() => param(page, "resort")).toBe("happo-one");
      await routeReady(page);
      await swapButton(page).click();

      await expect(from).toHaveValue(/Happo-One/);
    });

    test("bus: the button is disabled and the reason is on screen", async ({
      page,
    }) => {
      await page.goto(`/?from=${STATION}&mode=bus`);
      await expect(swapButton(page)).toBeDisabled();
      await expect(page.getByText(BUS_HINT)).toBeVisible();
    });
  });
}

test("a swap drops the chosen bus, whose stop belonged to the old start", async ({
  page,
}) => {
  await page.route("**/api/bus/options**", (route) =>
    route.fulfill({ contentType: "application/json", body: MARCH_20 }),
  );
  await page.goto("/?from=36.69711,137.85393&mode=bus");
  await page.getByLabel("Leave after").fill("2026-03-20T08:00");
  await page
    .getByRole("region", { name: "Hakuba47 Mountain Resort" })
    .getByText("08:11 → 08:39")
    .click({ timeout: 15_000 });
  const journey = page.locator('[aria-label="Journey"]');
  await expect(journey).toBeVisible();

  await page.getByRole("tab", { name: /drive/i }).click();
  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Happo-One/ })
    .click({ timeout: 15_000 });
  await routeReady(page);
  await swapButton(page).click();
  await page.getByRole("tab", { name: /bus/i }).click();

  await expect(page.getByRole("tab", { name: /bus/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(journey).toHaveCount(0);
});
