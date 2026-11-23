import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "./dev-only";

// SPEC-ski-runs "Map": runs and lifts from zoom 12, names from 14, under every route and pin
const HAPPO_ONE = { lng: 137.8215, lat: 36.7028 }; // middle of its runs in data/ski_lines.json
const RUN_LAYERS = ["ski-runs", "ski-lifts-casing", "ski-lifts"];
const NAME_LAYER = "ski-names";
// a walk trip, so the route layers and the lodging pins are all drawn
const TRIP = "/?from=36.69711,137.85393&mode=walk&dest=pt:36.69877,137.86197";

type DevMap = {
  getStyle(): { layers: { id: string }[] };
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
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

test("runs and lifts show from zoom 12: drawn at 14, none at 11", async ({
  page,
}) => {
  await openMap(page);
  expect(await drawnAt(page, 14, RUN_LAYERS)).toBeGreaterThan(0);
  expect(await drawnAt(page, 11, RUN_LAYERS)).toBe(0);
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
