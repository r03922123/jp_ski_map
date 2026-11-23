import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "./dev-only";

// SPEC-ski-runs "Map" and v1.3: runs and lifts from zoom 10, names from 14, under every route and pin
const HAPPO_ONE = { lng: 137.8215, lat: 36.7028 }; // middle of its runs in data/ski_lines.json
const RUN_LAYERS = ["ski-runs", "ski-lifts-casing", "ski-lifts"];
const NAME_LAYER = "ski-names";
// a walk trip, so the route layers and the lodging pins are all drawn
const TRIP = "/?from=36.69711,137.85393&mode=walk&dest=pt:36.69877,137.86197";

type DevMap = {
  getStyle(): { layers: { id: string }[] };
  queryRenderedFeatures(
    a: { layers: string[] } | [number, number],
    o?: { layers: string[] },
  ): {
    layer: { id: string };
    geometry: { type: string; coordinates: [number, number][] };
    properties: { name?: string; kind?: string };
  }[];
  project(c: [number, number]): { x: number; y: number };
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
  const ours = ["ski-selected", ...RUN_LAYERS, NAME_LAYER, "ski-lines-hit"];
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

// SPEC-ski-runs v1.1: a click on a lift opens its card, and picks no start
test("a click on a lift opens its card, the start unchanged", async ({
  page,
}) => {
  await openMap(page);
  expect(await drawnAt(page, 15, ["ski-lifts"])).toBeGreaterThan(0);
  const hit = await page.evaluate(() => {
    const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
    const taps = ["lodging-pins", "route-alts-hit", "ski-lines-hit"];
    for (const f of map.queryRenderedFeatures({ layers: ["ski-lifts"] })) {
      if (f.geometry.type !== "LineString") continue;
      // a lift is a straight line whose ends may be off screen: try points along it
      const [a, b] = f.geometry.coordinates;
      for (let t = 0.05; t < 1; t += 0.05) {
        const p = map.project([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ]);
        // bare map there (no panel or marker), and a lift is the top tap target
        const el = document.elementFromPoint(p.x, p.y);
        const top = map.queryRenderedFeatures([p.x, p.y], { layers: taps })[0];
        if (
          el?.classList.contains("maplibregl-canvas") &&
          top?.layer.id === "ski-lines-hit" &&
          top.properties.kind === "lift"
        )
          return { x: p.x, y: p.y, name: top.properties.name ?? null };
      }
    }
    return null;
  });
  expect(hit, "a lift on bare map").not.toBeNull();
  if (!hit) return;
  await page.mouse.click(hit.x, hit.y);
  const title = hit.name?.split(", ")[0] || "Unnamed lift";
  const card = page.getByRole("group", { name: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("lift");
  expect(new URL(page.url()).searchParams.get("from")).toBeNull();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(0);
});
