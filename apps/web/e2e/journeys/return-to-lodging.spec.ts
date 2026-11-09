import { readFileSync } from "node:fs";
import { expect, type Page, type Request, test } from "@playwright/test";

/**
 * Journey: BACK TO THE LODGING (SPEC-web-app v1.10, v1.11). After skiing, one tap turns
 * "lodging → resort" into "resort → lodging". Needs the API and Valhalla running.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station stands in for the lodging
const RESORT_END = "36.65,137.84"; // near Goryu: a start that isn't the lodging
const TRIP = `/?from=${STATION}&mode=drive&resort=happo-one`;
const SWAP = "Swap start and destination";
const OLD_BUS_HINT = "Way back from a resort: use Drive or Walk.";
const MARCH_20 = readFileSync(
  "e2e/fixtures/bus-options-2026-03-20.json",
  "utf8",
);
const BACK_MARCH_20 = readFileSync(
  "e2e/fixtures/bus-to-place-2026-03-20.json",
  "utf8",
);
const isToPlace = (r: Request) => /\/api\/bus\/to-place\?/.test(r.url());
const isBusOptions = (r: Request) => /\/api\/bus\/options\?/.test(r.url());
const mockBuses = async (page: Page) => {
  await page.route("**/api/bus/to-place**", (route) =>
    route.fulfill({ contentType: "application/json", body: BACK_MARCH_20 }),
  );
  await page.route("**/api/bus/options**", (route) =>
    route.fulfill({ contentType: "application/json", body: MARCH_20 }),
  );
};

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

    test("bus: with no destination the button is disabled, and the old hint is gone", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=bus`);
      await expect(swapButton(page)).toBeDisabled();
      await expect(page.getByText(OLD_BUS_HINT)).toHaveCount(0);
    });

    test("bus: a swap lists the shuttles back, a second tap restores the resorts", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=bus&resort=happo-one`);
      await page.getByLabel("Leave after").fill("2026-03-20T14:30");
      await expect(swapButton(page)).toBeEnabled();

      const back = page.waitForRequest(
        (r) => isToPlace(r) && coordOf(r, "to") === STATION,
      );
      await swapButton(page).click();
      expect(coordOf(await back, "from")).not.toBe(STATION);

      await expect(page.getByText("14:37 → 15:10")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page
          .getByText("Get off Hakuba Happo Bus Terminal · walk 5 min")
          .first(),
      ).toBeVisible();
      await expect(page.getByText(OLD_BUS_HINT)).toHaveCount(0);
      expect(param(page, "dest")).toBe(`pt:${STATION}`);

      const resortsAgain = page.waitForRequest(
        (r) => isBusOptions(r) && coordOf(r, "from") === STATION,
      );
      await swapButton(page).click();
      await resortsAgain;
      await expect.poll(() => param(page, "resort")).toBe("happo-one");
      expect(param(page, "dest")).toBeNull();
    });

    test("bus: a chosen shuttle swaps to its resort", async ({ page }) => {
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=bus`);
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");
      await page
        .getByRole("region", { name: "Hakuba47 Mountain Resort" })
        .getByText("08:11 → 08:39")
        .click({ timeout: 15_000 });

      const back = page.waitForRequest(
        (r) => isToPlace(r) && coordOf(r, "to") === STATION,
      );
      await swapButton(page).click();

      // from where that bus drops you, not from the resort's first access point
      const { lat, lng } = JSON.parse(MARCH_20)
        .resorts.find((r: { resortId: string }) => r.resortId === "hakuba47")
        .options[0].rideStops.at(-1).coord;
      expect(coordOf(await back, "from")).toBe(`${lat},${lng}`);
      await expect(page.locator('[aria-label="Journey"]')).toHaveCount(0);
    });

    test("bus: the link goes back to the resort list", async ({ page }) => {
      await mockBuses(page);
      await page.goto(`/?from=${RESORT_END}&mode=bus&dest=pt:${STATION}`);
      await page.getByLabel("Leave after").fill("2026-03-20T14:30");
      await expect(page.getByText("14:37 → 15:10")).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: "Shuttles to resorts" }).click();

      await expect.poll(() => param(page, "dest")).toBeNull();
      await expect(page.getByText("14:37 → 15:10")).toHaveCount(0);
    });

    // SPEC-web-app v1.13 rule 5: Bus has the same To box as Drive and Walk
    const toBox = (page: Page) => page.getByRole("combobox", { name: "To" });
    const pickTo = async (page: Page, text: string, option: RegExp) => {
      await toBox(page).fill(text);
      await page.getByRole("option", { name: option }).first().click();
    };
    const region = (page: Page, name: string) =>
      page.getByRole("region", { name });
    const HAKUBA47 = "Hakuba47 Mountain Resort";
    const sections = (page: Page) => page.getByRole("heading", { level: 3 });
    const everyResortListed = (page: Page) =>
      expect.poll(() => sections(page).count()).toBeGreaterThan(1);
    // only the resort: the real index also has stops named after it
    const onlySuggestHakuba47 = (page: Page) =>
      page.route("**/api/places/suggest?*", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "hakuba47",
              kind: "resort",
              name: HAKUBA47,
              nameJa: null,
              coord: { lat: 36.68, lng: 137.82 },
              detail: null,
              match: null,
              source: "index",
            },
          ]),
        }),
      );
    const allResorts = async (page: Page) => {
      await page.goto(`/?from=${STATION}&mode=bus`);
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");
      await expect(region(page, HAKUBA47)).toBeVisible({ timeout: 15_000 });
    };

    test("bus: the To box names the lodging, and ✕ goes back to every resort", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${RESORT_END}&mode=bus&dest=pt:${STATION}`);
      await page.getByLabel("Leave after").fill("2026-03-20T14:30");
      await expect(page.getByText("14:37 → 15:10")).toBeVisible({
        timeout: 15_000,
      });
      await expect(toBox(page)).toHaveValue("Chosen place"); // a link has no name
      // the box is the destination: no second, read-only To row under it
      await expect(page.getByRole("list", { name: "Trip" })).not.toContainText(
        "To:",
      );

      await page.getByRole("button", { name: "Remove destination" }).click();

      await expect.poll(() => param(page, "dest")).toBeNull();
      await expect(page.getByText("14:37 → 15:10")).toHaveCount(0);
      await expect(toBox(page)).toHaveValue("");
    });

    test("bus: the link clears a resort left selected on another tab too", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(
        `/?from=${RESORT_END}&mode=bus&resort=happo-one&dest=pt:${STATION}`,
      );
      await page.getByLabel("Leave after").fill("2026-03-20T14:30");

      await page
        .getByRole("button", { name: "Shuttles to resorts" })
        .click({ timeout: 15_000 });

      await expect(toBox(page)).toHaveValue("");
      await everyResortListed(page);
    });

    test("bus: a resort sent there from Saved is the destination", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=drive&resort=iwatake`);
      await routeReady(page);
      await page.getByRole("button", { name: /^Save Hakuba Iwatake/ }).click();
      await page.getByRole("checkbox", { name: /Starred/ }).check();
      await page.getByRole("button", { name: "Done" }).click();
      await expect
        .poll(() => page.evaluate(() => history.state?.overlay === true))
        .toBe(false);

      await page.goto(`/?from=${STATION}&mode=bus&dest=pt:36.71705,137.85862`);

      await expect(toBox(page)).toHaveValue(/Iwatake/, { timeout: 15_000 });
      await expect(sections(page)).toHaveCount(1, { timeout: 15_000 });
    });

    test("bus: a swap starts from the saved resort, not one left selected", async ({
      page,
    }) => {
      const SAVED_IWATAKE = "36.71705,137.85862";
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=drive&resort=iwatake`);
      await routeReady(page);
      await page.getByRole("button", { name: /^Save Hakuba Iwatake/ }).click();
      await page.getByRole("checkbox", { name: /Starred/ }).check();
      await page.getByRole("button", { name: "Done" }).click();
      await expect
        .poll(() => page.evaluate(() => history.state?.overlay === true))
        .toBe(false);
      await page.goto(
        `/?from=${STATION}&mode=bus&resort=happo-one&dest=pt:${SAVED_IWATAKE}`,
      );
      await expect(toBox(page)).toHaveValue(/Iwatake/, { timeout: 15_000 });

      const back = page.waitForRequest(
        (r) => isToPlace(r) && coordOf(r, "to") === STATION,
      );
      await swapButton(page).click();

      expect(coordOf(await back, "from")).toBe(SAVED_IWATAKE);
    });

    test("bus: an unknown resort in the link still lists every resort", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${STATION}&mode=bus&resort=not-a-resort`);
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");

      await expect(region(page, HAKUBA47)).toBeVisible({ timeout: 15_000 });
      await everyResortListed(page);
    });

    test("bus: a place typed in To asks for the shuttles to it", async ({
      page,
    }) => {
      await mockBuses(page);
      await page.goto(`/?from=${RESORT_END}&mode=bus`);
      await page.getByLabel("Leave after").fill("2026-03-20T14:30");

      const back = page.waitForRequest(isToPlace);
      await pickTo(page, "Hakuba Station", /Station/);

      expect(coordOf(await back, "from")).toBe(RESORT_END);
      await expect(page.getByText("14:37 → 15:10")).toBeVisible({
        timeout: 15_000,
      });
      await expect(toBox(page)).toHaveValue(/Station/);
    });

    test("bus: a resort typed in To narrows the list, and ✕ widens it", async ({
      page,
    }) => {
      await mockBuses(page);
      await onlySuggestHakuba47(page);
      await allResorts(page);
      await everyResortListed(page);

      await pickTo(page, "Hakuba47", /Hakuba47/);

      await expect(sections(page)).toHaveCount(1);
      await expect(region(page, HAKUBA47)).toBeVisible();
      await expect(toBox(page)).toHaveValue(/Hakuba47/);

      await page.getByRole("button", { name: "Remove destination" }).click();

      await everyResortListed(page);
    });

    test("bus: a tapped bus names its resort without narrowing the list", async ({
      page,
    }) => {
      await mockBuses(page);
      await allResorts(page);

      await region(page, HAKUBA47).getByText("08:11 → 08:39").click();

      await expect(toBox(page)).toHaveValue(/Hakuba47/);
      await everyResortListed(page);
    });

    test("bus: ✕ after tapping a bus empties the box and drops the bus", async ({
      page,
    }) => {
      await mockBuses(page);
      await allResorts(page);
      await region(page, HAKUBA47).getByText("08:11 → 08:39").click();
      const journey = page.locator('[aria-label="Journey"]');
      await expect(journey).toBeVisible();

      await page.getByRole("button", { name: "Remove destination" }).click();

      await expect(toBox(page)).toHaveValue("");
      await expect(journey).toHaveCount(0);
      await everyResortListed(page);
    });

    test("bus: picking the chosen bus's own resort in To still drops the bus", async ({
      page,
    }) => {
      await mockBuses(page);
      await onlySuggestHakuba47(page);
      await allResorts(page);
      await region(page, HAKUBA47).getByText("08:11 → 08:39").click();
      const journey = page.locator('[aria-label="Journey"]');
      await expect(journey).toBeVisible();

      await pickTo(page, "Hakuba47", /Hakuba47/);

      await expect(sections(page)).toHaveCount(1);
      await expect(journey).toHaveCount(0);
    });

    test("bus: another resort chosen on Drive drops the bus to the old one", async ({
      page,
    }) => {
      await mockBuses(page);
      await allResorts(page);
      await region(page, HAKUBA47).getByText("08:11 → 08:39").click();
      const journey = page.locator('[aria-label="Journey"]');
      await expect(journey).toBeVisible();

      await page.getByRole("tab", { name: /drive/i }).click();
      await page
        .getByRole("list", { name: "Ranked resorts" })
        .getByRole("button", { name: /Happo-One/ })
        .click({ timeout: 15_000 });
      await page.getByRole("tab", { name: /bus/i }).click();

      await expect(toBox(page)).toHaveValue(/Happo-One/);
      await expect(journey).toHaveCount(0);
    });

    test("bus: a new pick in To drops the chosen bus", async ({ page }) => {
      await mockBuses(page);
      await allResorts(page);
      await region(page, HAKUBA47).getByText("08:11 → 08:39").click();
      const journey = page.locator('[aria-label="Journey"]');
      await expect(journey).toBeVisible();

      await pickTo(page, "Happo-One", /Happo-One/);

      await expect(toBox(page)).toHaveValue(/Happo-One/);
      await expect(journey).toHaveCount(0);
    });

    test("bus: no start and no destination leaves no To box", async ({
      page,
    }) => {
      await page.goto("/?mode=bus");
      await expect(page.getByRole("tab", { name: /bus/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(toBox(page)).toHaveCount(0);
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

test("a chosen way-back shuttle goes when the destination is cleared", async ({
  page,
}) => {
  await mockBuses(page);
  await page.goto(`/?from=${RESORT_END}&mode=bus&dest=pt:${STATION}`);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
  await page.getByLabel("Leave after").fill("2026-03-20T14:30");
  await page.getByText("14:37 → 15:10").click({ timeout: 15_000 });
  const journey = page.locator('[aria-label="Journey"]');
  await expect(journey).toBeVisible();

  // the trip's labels are hidden (SPEC-web-app v1.12), so this link is the way out
  await page.getByRole("button", { name: "Shuttles to resorts" }).click();

  await expect.poll(() => param(page, "dest")).toBeNull();
  await expect(journey).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute(
    "data-map-ride-stops",
    "0",
  );
});
