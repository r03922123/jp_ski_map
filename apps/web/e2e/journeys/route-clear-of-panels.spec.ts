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
const NORTH = `/?from=${STATION}&mode=walk&resort=cortina`; // the route runs up the screen
const SOUTH = `/?from=${STATION}&mode=walk&resort=jigatake`; // and down it
// 3 walking options (2026-11-25); one entrance, so the first route answer is the one drawn
const OPTIONS = `/?from=${STATION}&mode=walk&resort=sanosaka`;

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
        bottom: sideCard ? window.innerHeight : sheet.top - FRAME_PX,
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
  // the mode row also fetches the other modes' times; wait for the trip's own mode
  const mode = new URL(path, "http://e2e").searchParams.get("mode");
  const answer = routesAnswer(
    page,
    (url) => url.searchParams.get("mode") === mode,
  );
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

      await page
        .getByRole("list", { name: "Route options" })
        .getByRole("button")
        .nth(1)
        .click();

      await expectClear(page, set.alternates[0].geometry.coordinates);
    });
  });
}

// a landscape phone left ~80 px of map between the panels: with a route, the collapsed
// sheet is only its ETA + Start row (T77 keeps both in view), and expands as before
for (const device of DEVICES.filter((d) => d.width > d.height && d.touch)) {
  test.describe(`slim bar · ${device.name}`, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
    });

    test("a route leaves the map room above a slim ETA + Start bar", async ({
      page,
    }) => {
      const out = await open(page, NORTH);
      const sheet = page.locator("[data-sheet]");
      const start = page.getByRole("button", {
        name: /Start navigation|Preview route/,
      });
      await expect(start).toBeInViewport({ ratio: 1 });
      await expect(page.getByText(/^ETA ~/)).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => (await sheet.boundingBox())?.height ?? 0)
        .toBeLessThanOrEqual(84); // route-geo SLIM_BAR_PX
      const header = await page.locator("[data-trip-header]").boundingBox();
      const box = await sheet.boundingBox();
      if (!header || !box) throw new Error("missing panel");
      expect(box.y - (header.y + header.height)).toBeGreaterThanOrEqual(120);
      await expectClear(page, out.primary.geometry.coordinates);

      await page.getByRole("button", { name: "Expand directions" }).click();
      await expect
        .poll(async () => (await sheet.boundingBox())?.height ?? 0)
        .toBeGreaterThan(150);
      // the steps open under the selected route option
      await page
        .getByRole("list", { name: "Route options" })
        .locator("button[aria-current='true']")
        .click();
      await expect(page.getByRole("list", { name: "Steps" })).toBeVisible();

      // collapsed again after scrolling down the steps: the bar shows ETA and Start
      await page
        .locator("[data-sheet-body]")
        .evaluate((body) => body.scrollTo(0, body.scrollHeight));
      await page.getByRole("button", { name: "Collapse directions" }).click();
      await expect(start).toBeInViewport({ ratio: 1 });
      await expect(page.getByText(/^ETA ~/)).toBeInViewport({ ratio: 1 });
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

  // the slim bar's flag flips with Saved; only a short phone's fit may follow it
  test("opening and closing Saved leaves a panned map where it is", async ({
    page,
  }) => {
    const out = await open(page, NORTH);
    await expectClear(page, out.primary.geometry.coordinates);
    const centre = () =>
      page.evaluate(() => {
        const map = (
          window as unknown as {
            __hakubaMap: { getCenter(): { lat: number; lng: number } };
          }
        ).__hakubaMap;
        const c = map.getCenter();
        return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
      });
    await page.mouse.move(900, 400);
    await page.mouse.down();
    await page.mouse.move(1000, 300, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const panned = await centre();

    const saved = page.getByRole("button", { name: "Saved places" });
    await saved.click();
    await page.waitForTimeout(1_000);
    expect(await centre()).toBe(panned);
    await saved.click();
    await page.waitForTimeout(1_000);
    expect(await centre()).toBe(panned);
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
        `/?from=${STATION}&mode=walk&dest=pt:36.78300,137.89900`,
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
      await page.goto("/?mode=walk&resort=jigatake");
      await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
        timeout: 30_000,
      });
      await expectClear(page, [], { start: false, end: true });
    });

    test("a start with no destination yet stays clear", async ({ page }) => {
      await page.goto("/?from=36.60000,137.85000&mode=walk");
      await expectClear(page, [], { start: true, end: false });
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

test.describe("turning a phone", () => {
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  });

  test("a lone destination stays clear", async ({ page }) => {
    await page.goto("/?mode=walk&resort=jigatake");
    await expectClear(page, [], { start: false, end: true });

    await page.setViewportSize({ width: 667, height: 375 });

    await expectClear(page, [], { start: false, end: true });
  });

  // only the touch the map turned under stops being a tap: not a later one that starts
  // on the sheet, after a plain tap (its mousedown left the map "pressed") or a cancel
  for (const [label, before] of [
    ["after a tap on the map", "tap"],
    ["after a touch the turn cancelled", "cancel"],
  ] as const) {
    test(`a sheet tap still works ${label}`, async ({ page }) => {
      await open(page, NORTH);
      await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
        timeout: 30_000,
      });
      const cdp = await page.context().newCDPSession(page);
      const at = { x: 30, y: 200, id: 1 };
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [at],
      });
      if (before === "tap") {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await page.waitForTimeout(800);
        await page.setViewportSize({ width: 667, height: 375 });
      } else {
        await page.setViewportSize({ width: 667, height: 375 });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchCancel",
          touchPoints: [],
        });
      }
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Expand directions" }).tap();
      await expect(page.locator("[data-sheet]")).toHaveAttribute(
        "data-state",
        "expanded",
      );
    });
  }

  // turned, y 350 is on the sheet's ETA text and y 200 still on the map. Lifted on the
  // map, the tap's mousedown used to stop the fit (MapLibre takes it as a grab)
  for (const [where, y] of [
    ["on the sheet", 350],
    ["on the map", 200],
  ] as const) {
    test(`with a finger on the map, the fit catches up when it lifts ${where}`, async ({
      page,
    }) => {
      const out = await open(page, NORTH);
      await expectClear(page, out.primary.geometry.coordinates);
      const cdp = await page.context().newCDPSession(page);

      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 30, y, id: 1 }],
      });
      await page.setViewportSize({ width: 667, height: 375 });
      await page.waitForTimeout(500);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });

      await expectClear(page, out.primary.geometry.coordinates);
      // the map turned under the finger: its lift is no tap and no long-press
      await expect(
        page.getByRole("group", { name: "Dropped pin" }),
      ).toHaveCount(0);
    });
  }
});
