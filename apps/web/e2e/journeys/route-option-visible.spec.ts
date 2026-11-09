import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "../dev-only";

/**
 * Journey: PICKING A ROUTE OPTION SHOWS THE WHOLE ROUTE (SPEC-web-app v1.9 rule 4). Every
 * point of the chosen route has to sit in the part of the map that no panel covers.
 * Needs the dev server (its map handle projects the line), the API and Valhalla.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const TRIP = "/?from=36.69877,137.86197&mode=drive&resort=iwatake"; // 3 options

const PHONES = [
  { name: "phone 393x852", width: 393, height: 852 },
  { name: "small phone 360x740", width: 360, height: 740 },
];

type Coords = number[][];

/** Primary then alternates, from the last /api/routes answer the page received. */
function watchRoutes(page: Page) {
  const seen: { routes: Coords[] } = { routes: [] };
  page.on("response", async (r) => {
    if (!/\/api\/routes\?/.test(r.url()) || !r.ok()) return;
    const set = await r.json();
    seen.routes = [set.primary, ...set.alternates].map(
      (route: { geometry: { coordinates: Coords } }) =>
        route.geometry.coordinates,
    );
  });
  return seen;
}

/** Points of `coords` hidden by the panels, once the camera has stopped. */
function coveredPoints(page: Page, coords: Coords) {
  return page.evaluate(
    async ({ coords }) => {
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
      const sheet = document
        .querySelector("[data-sheet]")
        ?.getBoundingClientRect();
      const header = document
        .querySelector("[data-trip-header]")
        ?.getBoundingClientRect();
      if (!sheet || !header) throw new Error("the panels are missing");
      const sideCard = window.innerWidth >= 768;
      const clear = {
        left: sideCard ? sheet.right : 0,
        right: window.innerWidth,
        top: sideCard ? 0 : header.bottom,
        bottom: sideCard ? window.innerHeight : sheet.top,
      };
      return coords
        .map(map.project, map)
        .filter(
          (p) =>
            p.x < clear.left ||
            p.x > clear.right ||
            p.y < clear.top ||
            p.y > clear.bottom,
        ).length;
    },
    { coords },
  );
}

const option = (page: Page, index: number) =>
  page.locator("label:has(input[name=route-option])").nth(index);
const sheet = (page: Page) => page.locator("[data-sheet]");

async function openTrip(page: Page) {
  const seen = watchRoutes(page);
  await page.goto(TRIP);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
  await expect(option(page, 1)).toBeAttached({ timeout: 20_000 });
  return seen;
}

test.beforeEach(() => devOnly("projects the route with the dev map handle"));

for (const device of PHONES) {
  test.describe(device.name, () => {
    test.use({
      viewport: { width: device.width, height: device.height },
      isMobile: true,
      hasTouch: true,
    });

    test("picking an option from the expanded sheet shows the whole route", async ({
      page,
    }) => {
      const seen = await openTrip(page);
      await page.getByRole("button", { name: "Expand directions" }).click();
      await expect(sheet(page)).toHaveAttribute("data-state", "expanded");

      await option(page, 1).click();

      await expect(sheet(page)).toHaveAttribute("data-state", "collapsed");
      expect(await coveredPoints(page, seen.routes[1])).toBe(0);
    });

    test("changing the mode from the expanded sheet shows the whole route", async ({
      page,
    }) => {
      await openTrip(page);
      await page.getByRole("button", { name: "Expand directions" }).click();
      await expect(sheet(page)).toHaveAttribute("data-state", "expanded");

      const walked = page.waitForResponse(/\/api\/routes\?mode=walk/);
      await page.getByRole("tab", { name: /walk/i }).click();
      const body = await (await walked).json();

      await expect(sheet(page)).toHaveAttribute("data-state", "collapsed");
      await expect
        .poll(() => coveredPoints(page, body.primary.geometry.coordinates))
        .toBe(0);
    });

    test("tapping Bus leaves the sheet open: its list is the answer", async ({
      page,
    }) => {
      await openTrip(page);
      await page.getByRole("button", { name: "Expand directions" }).click();
      await expect(sheet(page)).toHaveAttribute("data-state", "expanded");

      await page.getByRole("tab", { name: /bus/i }).click();

      await expect(page.getByRole("tab", { name: /bus/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // give a wrong collapse the time to happen (the sheet's transition is 200 ms)
      await page.waitForTimeout(500);
      await expect(sheet(page)).toHaveAttribute("data-state", "expanded");
    });
  });
}

test.describe("laptop 1440x900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("after panning away, picking an option brings the whole route back", async ({
    page,
  }) => {
    const seen = await openTrip(page);
    expect(await coveredPoints(page, seen.routes[0])).toBe(0); // the first fit is done
    await page.evaluate(() => {
      (
        window as unknown as {
          __hakubaMap: { panBy(o: number[], a: { duration: number }): void };
        }
      ).__hakubaMap.panBy([900, 500], { duration: 0 });
    });
    expect(await coveredPoints(page, seen.routes[1])).toBeGreaterThan(0);

    await option(page, 1).click();

    expect(await coveredPoints(page, seen.routes[1])).toBe(0);
  });
});
