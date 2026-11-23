import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "./dev-only";

// SPEC-ski-runs "Map" and v2: runs and lifts from zoom 10, names from 14, under every route and pin
const HAPPO_ONE = { lng: 137.8215, lat: 36.7028 }; // middle of its runs in data/ski_lines.json
const RUN_LAYERS = ["ski-runs", "ski-lifts-casing", "ski-lifts"];
const NAME_LAYER = "ski-names";
// a walk trip, so the route layers and the lodging pins are all drawn
const TRIP = "/?from=36.69711,137.85393&mode=walk&dest=pt:36.69877,137.86197";

type DevMap = {
  getStyle(): { layers: { id: string }[] };
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
  project(at: [number, number]): { x: number; y: number };
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  once(event: "idle", done: () => void): void;
};

async function openMap(page: Page, url = "/") {
  devOnly("reads the map through window.__hakubaMap");
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

/** Features MapLibre drew from these layers at Happo-One, once the map is idle at this zoom. */
function drawnAt(page: Page, zoom: number, layers: string[]) {
  return page.evaluate(
    ({ at, zoom, layers }) => {
      const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
      // idle: every source loaded and every tile rendered
      const idle = new Promise<void>((done) => map.once("idle", done));
      map.jumpTo({ center: [at.lng, at.lat], zoom });
      return idle.then(() => map.queryRenderedFeatures({ layers }).length);
    },
    { at: HAPPO_ONE, zoom, layers },
  );
}

test("runs and lifts show from zoom 10: drawn at 14 and 11, none at 9", async ({
  page,
}) => {
  await openMap(page);
  // each on its own: a broken run filter must not hide behind the lifts' count
  expect(await drawnAt(page, 14, ["ski-runs"])).toBeGreaterThan(0);
  expect(await drawnAt(page, 14, ["ski-lifts"])).toBeGreaterThan(0);
  expect(await drawnAt(page, 11, ["ski-lifts"])).toBeGreaterThan(0);
  expect(await drawnAt(page, 9, RUN_LAYERS)).toBe(0);
});

test("run and lift names show from zoom 14: drawn at 14, none at 13", async ({
  page,
}) => {
  await openMap(page);
  expect(await drawnAt(page, 14, [NAME_LAYER])).toBeGreaterThan(0);
  expect(await drawnAt(page, 13, [NAME_LAYER])).toBe(0);
});

test("every run and lift layer sits under the lodging pins and the route", async ({
  page,
}) => {
  await openMap(page, TRIP);
  const ours = [...RUN_LAYERS, NAME_LAYER];
  const above = ["lodging-pins", "ride-line", "route-active-line"];
  await expect
    .poll(() =>
      page.evaluate(
        (ids) =>
          (window as unknown as { __hakubaMap: DevMap }).__hakubaMap
            .getStyle()
            .layers.map((l) => l.id)
            .filter((id) => ids.includes(id)),
        [...ours, ...above],
      ),
    )
    .toEqual([...ours, ...above]);
});

test("a tap on a lift opens its card, and its resort name opens the resort", async ({
  page,
}) => {
  await openMap(page);
  // the middle of Happo-One's gondola, Adam (its first and last points in data/ski_lines.json)
  const at = await page.evaluate(() => {
    const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
    const idle = new Promise<void>((done) => map.once("idle", done));
    const mid: [number, number] = [
      (137.83683 + 137.81584) / 2,
      (36.70179 + 36.6975) / 2,
    ];
    map.jumpTo({ center: mid, zoom: 15 });
    return idle.then(() => map.project(mid));
  });
  await page.locator(".maplibregl-canvas").click({ position: at });
  const card = page.getByRole("region", { name: /Adam/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Gondola");
  await expect(card).toContainText(/Vertical \d+ m/);
  await card
    .getByRole("button", { name: "Hakuba Happo-One Snow Resort" })
    .click();
  await expect(card).toBeHidden();
});
