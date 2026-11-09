import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "../dev-only";

/**
 * Journey: START, DESTINATION AND ROUTE ARE NEVER UNDER A PANEL (SPEC-web-app v1.9 rule 4).
 * The markers stand above their point (anchor "bottom"), so checking only the route's
 * points misses a flag hidden by the card on top. Each value is measured from the live
 * panels. Needs the dev server (map handle), the API and Valhalla.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });
test.beforeEach(() => devOnly("projects the route with the dev map handle"));

const STATION = "36.69877,137.86197"; // JR Hakuba Station
const NORTH = `/?from=${STATION}&mode=drive&resort=cortina`; // the route runs up the screen
const SOUTH = `/?from=${STATION}&mode=drive&resort=jigatake`; // and down it
const OPTIONS = `/?from=${STATION}&mode=drive&resort=iwatake`; // 3 route options

const DEVICES = [
  { name: "iPhone-sized 390x699", width: 390, height: 699, touch: true },
  { name: "phone 393x852", width: 393, height: 852, touch: true },
  { name: "small phone 360x740", width: 360, height: 740, touch: true },
  { name: "landscape phone 740x360", width: 740, height: 360, touch: true },
  { name: "landscape phone 667x375", width: 667, height: 375, touch: true },
  { name: "tablet 768x1024", width: 768, height: 1024, touch: true },
  { name: "laptop 1280x720", width: 1280, height: 720, touch: false },
  { name: "desktop 1440x900", width: 1440, height: 900, touch: false },
];

type Coords = number[][];
const CLEAR = { route: 0, start: 0, end: 0 };
const FRAME_PX = 4; // the trip card's pixel frame is drawn outside its box

/** Points of the route, and pixels of each marker, that a panel or the screen edge cuts. */
function hidden(page: Page, coords: Coords, ends = { start: true, end: true }) {
  return page.evaluate(
    async ({ coords, ends, FRAME_PX }) => {
      const map = (
        window as unknown as {
          __hakubaMap: {
            isMoving(): boolean;
            project(c: number[]): { x: number; y: number };
          };
        }
      ).__hakubaMap;
      const idle = () => new Promise((done) => setTimeout(done, 200));
      await idle();
      while (map.isMoving()) await idle();
      const rect = (selector: string) => {
        const found = document.querySelector(selector);
        if (!found) throw new Error(`missing ${selector}`);
        return found.getBoundingClientRect();
      };
      const sheet = rect("[data-sheet]");
      const header = rect("[data-trip-header]");
      const sideCard = window.innerWidth >= 768;
      const clear = {
        left: sideCard ? sheet.right : 0,
        right: window.innerWidth,
        top: sideCard ? 0 : header.bottom + FRAME_PX,
        bottom: sideCard ? window.innerHeight : sheet.top,
      };
      const cut = (r: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }) =>
        Math.ceil(
          Math.max(
            0,
            clear.left - r.left,
            r.right - clear.right,
            clear.top - r.top,
            r.bottom - clear.bottom,
          ),
        );
      return {
        route: coords
          .map(map.project, map)
          .filter(
            (p) => cut({ left: p.x, right: p.x, top: p.y, bottom: p.y }) > 0,
          ).length,
        start: ends.start
          ? cut(
              rect('[aria-label="Starting point"], img[alt="Starting point"]'),
            )
          : 0,
        end: ends.end ? cut(rect('img[alt="Destination"]')) : 0,
      };
    },
    { coords, ends, FRAME_PX },
  );
}

const routesAnswer = (page: Page, predicate = (_: URL) => true) =>
  page.waitForResponse((r) => {
    const url = new URL(r.url());
    return url.pathname === "/api/routes" && r.ok() && predicate(url);
  });

async function open(page: Page, path: string) {
  const answer = routesAnswer(page);
  await page.goto(path);
  const body = await (await answer).json();
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
  return body;
}

/** Clear, and still clear once any late camera move has run. */
async function expectClear(
  page: Page,
  coords: Coords,
  ends?: { start: boolean; end: boolean },
) {
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
  await expect
    .poll(() => hidden(page, coords, ends), { timeout: 8_000 })
    .toEqual(CLEAR);
  await page.waitForTimeout(800);
  expect(await hidden(page, coords, ends)).toEqual(CLEAR);
}

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: device.touch,
      hasTouch: device.touch,
    });

    for (const [label, path] of [
      ["north", NORTH],
      ["south", SOUTH],
    ]) {
      test(`${label}: both ends and the route stay clear, swapped too`, async ({
        page,
      }) => {
        const out = await open(page, path);
        await expectClear(page, out.primary.geometry.coordinates);

        const back = routesAnswer(
          page,
          (url) => url.searchParams.get("to") === STATION,
        );
        await page
          .getByRole("button", { name: "Swap start and destination" })
          .click();
        const body = await (await back).json();
        await expectClear(page, body.primary.geometry.coordinates);
      });
    }

    test("picking an option keeps both ends and the route clear", async ({
      page,
    }) => {
      const set = await open(page, OPTIONS);
      const expand = page.getByRole("button", { name: "Expand directions" });
      if (device.width < 768) await expand.click();

      await page.locator("label:has(input[name=route-option])").nth(1).click();

      await expectClear(page, set.alternates[0].geometry.coordinates);
    });
  });
}

test.describe("resizing", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("narrowing the window to the phone layout keeps everything clear", async ({
    page,
  }) => {
    const out = await open(page, NORTH);
    await expectClear(page, out.primary.geometry.coordinates);

    await page.setViewportSize({ width: 500, height: 800 });

    await expectClear(page, out.primary.geometry.coordinates);
  });

  test("a shorter window keeps everything clear", async ({ page }) => {
    const out = await open(page, NORTH);
    await expectClear(page, out.primary.geometry.coordinates);

    await page.setViewportSize({ width: 1280, height: 480 });

    await expectClear(page, out.primary.geometry.coordinates);
  });
});

const MARCH_20 = readFileSync(
  "e2e/fixtures/bus-options-2026-03-20.json",
  "utf8",
);

for (const device of [
  { name: "phone", width: 390, height: 699, touch: true },
  { name: "laptop", width: 1280, height: 720, touch: false },
]) {
  test.describe(`other flows · ${device.name}`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: device.touch,
      hasTouch: device.touch,
      geolocation: { latitude: 36.69877, longitude: 137.86197 },
      permissions: ["geolocation"],
    });

    test("leaving navigation shows the whole trip again", async ({ page }) => {
      test.skip(!device.touch, "navigation is offered on phones only");
      const out = await open(page, NORTH);
      await page
        .getByRole("button", { name: /Start navigation|Preview route/ })
        .click();
      await expect(page.locator("main[data-piloting='true']")).toBeAttached();
      await page.waitForTimeout(2_500); // the follow camera tilts and zooms in
      await page.getByRole("button", { name: "Exit navigation" }).click();

      await expectClear(page, out.primary.geometry.coordinates);
    });

    test("a destination away from any road stays clear", async ({ page }) => {
      const out = await open(
        page,
        `/?from=${STATION}&mode=drive&dest=pt:36.78300,137.89900`,
      );
      await expectClear(page, out.primary.geometry.coordinates);
    });

    test("a route with stops stays clear", async ({ page }) => {
      const answer = page.waitForResponse(/\/api\/route\/path/);
      await page.goto(`${NORTH}&stops=36.74000,137.87000;36.76000,137.87500`);
      const route = await (await answer).json();
      await expectClear(page, route.geometry.coordinates);
    });

    test("a destination with no start yet stays clear", async ({ page }) => {
      await page.goto("/?mode=drive&resort=jigatake");
      await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
        timeout: 30_000,
      });
      await expectClear(page, [], { start: false, end: true });
    });

    test("a chosen bus stays clear, its walk and its ride", async ({
      page,
    }) => {
      await page.route("**/api/bus/options**", (route) =>
        route.fulfill({ contentType: "application/json", body: MARCH_20 }),
      );
      await page.goto("/?from=36.69711,137.85393&mode=bus");
      await page.getByLabel("Leave after").fill("2026-03-20T08:00");
      const walk = routesAnswer(page);
      const ride = page.waitForResponse(/\/api\/route\/path/);
      await page
        .getByRole("region", { name: "Hakuba47 Mountain Resort" })
        .getByText("08:11 → 08:39")
        .click({ timeout: 15_000 });
      const walked = await (await walk).json();
      const rode = await (await ride).json();

      await expectClear(
        page,
        [...walked.primary.geometry.coordinates, ...rode.geometry.coordinates],
        { start: true, end: false },
      );
    });
  });
}
