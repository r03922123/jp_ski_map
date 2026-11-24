import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "./dev-only";

// SPEC-web-app v1.4: add a stop by typing or by tapping the map; remove it; share it.
const TRIP = "/?from=36.69711,137.85393&mode=walk&resort=happo-one";
const steps = (page: Page) => page.getByRole("list", { name: "Steps" });
const trip = (page: Page) => page.getByRole("list", { name: "Trip" });

type DevMap = {
  queryRenderedFeatures(o: {
    layers: string[];
  }): { geometry: { coordinates: [number, number][] } }[];
  project(c: [number, number]): { x: number; y: number };
  getCanvas(): HTMLCanvasElement;
  jumpTo(o: { zoom: number }): void;
  isMoving(): boolean;
};

async function loaded(page: Page) {
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(page.getByRole("list", { name: "Route options" })).toBeVisible({
    timeout: 20_000,
  });
}

/** Open the selected route's steps and show every one (the list collapses after five). */
async function allSteps(page: Page) {
  // the steps open under the selected route option
  const option = page
    .getByRole("list", { name: "Route options" })
    .locator("button[aria-current='true']");
  if ((await option.getAttribute("aria-expanded")) === "false")
    await option.click();
  const more = page.getByRole("button", { name: /Show all \d+ steps/ });
  if (await more.isVisible()) await more.click();
  return steps(page).innerText();
}

/**
 * Tap the map at a point of a drawn layer that is really on screen (not under the panel):
 * `pick` chooses the vertex from that layer's line.
 */
async function tapLayer(
  page: Page,
  layer: string,
  pick: "middle" | "farthest-from-active",
) {
  // where a line is on screen depends on the camera: let it settle first
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !(
            window as unknown as { __hakubaMap: DevMap }
          ).__hakubaMap.isMoving(),
      ),
    )
    .toBe(true);
  const at = await page.evaluate(
    ([layerId, how]) => {
      const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
      const r = map.getCanvas().getBoundingClientRect();
      const line = map
        .queryRenderedFeatures({ layers: [layerId] })
        .flatMap((f) => f.geometry.coordinates);
      const active = map
        .queryRenderedFeatures({ layers: ["route-active-line"] })
        .flatMap((f) => f.geometry.coordinates);
      const screen = (c: [number, number]) => {
        const p = map.project(c);
        return { x: r.left + p.x, y: r.top + p.y };
      };
      const onMap = (c: [number, number]) => {
        const { x, y } = screen(c);
        return document.elementFromPoint(x, y) === map.getCanvas();
      };
      const candidates = line.filter(onMap);
      if (candidates.length === 0) return null;
      const gap = (c: [number, number]) =>
        Math.min(...active.map((a) => Math.hypot(a[0] - c[0], a[1] - c[1])));
      const chosen =
        how === "middle"
          ? candidates[Math.floor(candidates.length / 2)]
          : candidates.reduce((best, c) => (gap(c) > gap(best) ? c : best));
      return screen(chosen);
    },
    [layer, pick] as const,
  );
  if (!at) throw new Error(`no visible point of ${layer} to tap`);
  await page.mouse.click(at.x, at.y);
}

test("add a stop by typing: the route goes through it, and the link keeps it", async ({
  page,
}) => {
  await page.goto(TRIP);
  await loaded(page);
  expect(await allSteps(page)).not.toContain("Arrive at stop 1");

  await page.getByRole("button", { name: "Add destination" }).click();
  const box = page.getByRole("combobox", { name: "Stop 1" });
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute("placeholder", /tap the map/i);
  await box.fill("7-Eleven");
  await page
    .getByRole("option", { name: /7-Eleven/ })
    .first()
    .click({ timeout: 15_000 });

  await expect(trip(page).getByRole("listitem")).toHaveCount(2);
  await expect(trip(page).getByRole("listitem").nth(1)).toContainText(
    "7-Eleven",
  );
  // focus stays in the panel, on the next thing to do
  await expect(
    page.getByRole("button", { name: "Add destination" }),
  ).toBeFocused();
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toMatch(/Arrive at stop 1(, on the (right|left))?\./);
  // a stop is not the destination: Valhalla's wording for leg ends is replaced
  expect(await allSteps(page)).not.toMatch(/stop 1[^\n]*destination/);
  await expect(page).toHaveURL(/stops=36\.\d+%2C137\.\d+/);
  await expect(page.locator('[data-trip-stop="1"]')).toBeVisible();

  // the shared link brings the stop back
  await page.reload();
  await loaded(page);
  await expect(trip(page).getByRole("listitem")).toHaveCount(2);
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toContain("Arrive at stop 1");
});

test("with both ends set, a click on an alternate route line still selects it", async ({
  page,
}) => {
  devOnly("finds the route line on screen through the dev map handle");
  await page.goto(TRIP);
  await loaded(page);
  const main = page.locator("main");
  await expect(main).toHaveAttribute(
    "data-route-layers",
    /^primary,alternate/,
    {
      timeout: 15_000,
    },
  );

  await tapLayer(page, "route-alts-hit", "farthest-from-active");

  await expect(main).toHaveAttribute("data-route-layers", /alternate,primary$/);
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);
});

test("a stop box takes a tap on an alternate route line (a stop on the way), then ✕ removes it", async ({
  page,
}) => {
  devOnly("finds the route line on screen through the dev map handle");
  await page.goto(TRIP);
  await loaded(page);
  // the case this rule exists for: without a stop box, this tap would pick that route
  await page.getByRole("button", { name: "Add destination" }).click();
  await tapLayer(page, "route-alts-hit", "farthest-from-active");

  const stopRow = trip(page).getByRole("listitem").nth(1);
  await expect(stopRow).toContainText("Dropped pin");
  await expect(page.getByRole("combobox", { name: "Stop 1" })).toHaveCount(0);
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .toContain("Arrive at stop 1");
  // the tap filled the stop: the starting point didn't move
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);

  // tapping the stop's own circle does nothing to the trip
  await page.locator('[data-trip-stop="1"]').click();
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);
  await expect(trip(page).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Remove stop 1" }).click();
  await expect(trip(page).getByRole("listitem")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Add destination" }),
  ).toBeFocused();
  await expect
    .poll(() => allSteps(page), { timeout: 15_000 })
    .not.toContain("Arrive at stop");
  await expect(page).not.toHaveURL(/stops=/);
});

test("an empty stop box can be dismissed before typing; then a click leaves the trip alone", async ({
  page,
}) => {
  await page.goto(TRIP);
  await loaded(page);
  await page.getByRole("button", { name: "Add destination" }).click();
  await page.getByRole("button", { name: "Remove stop 1" }).click();
  await expect(page.getByRole("combobox", { name: "Stop 1" })).toHaveCount(0);

  // open map, away from the routes (a tap on a route line picks that route)
  const canvas = await page.locator("main canvas").boundingBox();
  if (!canvas) throw new Error("no map canvas");
  await page.mouse.click(
    canvas.x + canvas.width * 0.75,
    canvas.y + canvas.height * 0.5,
  );
  // longer than the wait that tells a click from a double-click (v1.13 rule 8)
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);
  await expect(page).not.toHaveURL(/stops=/);
});

test("clearing the start keeps the stops listed; the next click's pin is the new start", async ({
  page,
}) => {
  await page.goto(`${TRIP}&stops=36.69877,137.86197`);
  await loaded(page);
  await expect(trip(page).getByRole("listitem")).toHaveCount(2);
  // an open, empty box too: it must not take the tap meant for the new start
  await page.getByRole("button", { name: "Add destination" }).click();

  await page.getByRole("button", { name: "Remove starting point" }).click();
  await expect(
    page.getByRole("combobox", { name: "Search hotel or place" }),
  ).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Stop 2" })).toHaveCount(0);
  // stop 1 and the destination are still there, and still removable (v1.9: the
  // destination is the To box on top, the list holds stop 1)
  await expect(trip(page).getByRole("listitem")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Remove stop 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "To", exact: true }),
  ).toHaveValue(/Happo-One/);
  await expect(page).toHaveURL(/stops=36\.69877%2C137\.86197/);

  const canvas = await page.locator("main canvas").boundingBox();
  if (!canvas) throw new Error("no map canvas");
  await page.mouse.click(
    canvas.x + canvas.width * 0.75,
    canvas.y + canvas.height * 0.5,
  );
  await page
    .getByRole("group", { name: "Dropped pin" })
    .getByRole("button", { name: "Start here" })
    .click();
  await expect(page).toHaveURL(/from=36\.\d+%2C137\.\d+/);
  await expect(trip(page).getByRole("listitem")).toHaveCount(2);
});

test("while a stop box is open, a resort marker is the stop, not a new destination", async ({
  page,
}) => {
  devOnly("zooms out through the dev map handle");
  await page.goto(TRIP);
  await loaded(page);
  await page.getByRole("button", { name: "Add destination" }).click();

  // zoom out to the valley, then take a resort marker other than the destination's
  // that is really on screen (not under the panel)
  await page.evaluate(() =>
    (window as unknown as { __hakubaMap: DevMap }).__hakubaMap.jumpTo({
      zoom: 11,
    }),
  );
  const findMarker = () =>
    page.evaluate(() => {
      for (const b of document.querySelectorAll<HTMLButtonElement>(
        "[data-resort-marker]:not([data-resort-marker='happo-one'])",
      )) {
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (b.contains(document.elementFromPoint(x, y)))
          return { name: b.getAttribute("aria-label"), x, y };
      }
      return null;
    });
  await expect.poll(findMarker).not.toBeNull();
  const marker = await findMarker();
  if (!marker?.name) throw new Error("no resort marker on screen");
  await page.mouse.click(marker.x, marker.y);

  await expect(trip(page).getByRole("listitem").nth(1)).toContainText(
    marker.name,
  );
  await expect(page).toHaveURL(/resort=happo-one/);
});

test("the bus tab offers no stops and no ✕ on the bus's stop", async ({
  page,
}) => {
  // a chosen bus option gives the trip a To row: the rule is tested, not the empty state
  const options = readFileSync(
    "e2e/fixtures/bus-options-2026-03-20.json",
    "utf8",
  );
  await page.route("**/api/bus/options**", (route) =>
    route.fulfill({ contentType: "application/json", body: options }),
  );
  await page.clock.setFixedTime(new Date("2026-03-20T08:02:00+09:00"));
  await page.goto("/?from=36.69711,137.85393&mode=bus");
  await page
    .getByRole("region", { name: "Hakuba47 Mountain Resort" })
    .getByRole("button")
    .first()
    .click({ timeout: 15_000 });

  // only the start: the To box above is the destination (SPEC-web-app v1.13 rule 7)
  await expect(trip(page).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "To" })).toHaveValue(
    /Hakuba47/,
  );
  await expect(
    page.getByRole("button", { name: "Add destination" }),
  ).toHaveCount(0);
});

// re-review of #117: on Move down React moves the focused row, and the browser drops focus
// from a moved element; focus goes back to the moved stop's button
test("Move down keeps keyboard focus on the moved stop", async ({ page }) => {
  await page.goto(
    "/?from=36.6985,137.8376&mode=walk&resort=happo-one&stops=36.69000,137.84000;36.69500,137.84500",
  );
  const down = page.getByRole("button", { name: "Move stop 1 down" });
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    /stops=36\.69500%2C137\.84500%3B36\.69000|stops=36\.69500,137\.84500;36\.69000/,
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )
    .toBe("Move stop 2 down");
});
