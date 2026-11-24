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
    properties: { id?: string; name?: string; kind?: string };
  }[];
  project(c: [number, number]): { x: number; y: number };
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  isMoving(): boolean;
  unproject(p: [number, number]): { lng: number; lat: number };
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

/** A point on bare map (no panel or marker) where a line of this kind is the top tap target. */
function bareLine(page: Page, kind: "run" | "lift") {
  return page.evaluate(
    ({ kind, layer }) => {
      const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
      const taps = ["lodging-pins", "route-alts-hit", "ski-lines-hit"];
      for (const f of map.queryRenderedFeatures({ layers: [layer] })) {
        if (f.geometry.type !== "LineString") continue;
        // a line's ends may be off screen: try points along each of its legs
        const c = f.geometry.coordinates;
        for (let i = 0; i + 1 < c.length; i++)
          for (let t = 0.05; t < 1; t += 0.05) {
            const p = map.project([
              c[i][0] + (c[i + 1][0] - c[i][0]) * t,
              c[i][1] + (c[i + 1][1] - c[i][1]) * t,
            ]);
            const el = document.elementFromPoint(p.x, p.y);
            const top = map.queryRenderedFeatures([p.x, p.y], {
              layers: taps,
            })[0];
            if (
              el?.classList.contains("maplibregl-canvas") &&
              top?.layer.id === "ski-lines-hit" &&
              top.properties.kind === kind
            )
              return {
                x: p.x,
                y: p.y,
                id: String(top.properties.id),
                name: top.properties.name ?? null,
              };
          }
      }
      return null;
    },
    { kind, layer: kind === "run" ? "ski-runs" : "ski-lifts" },
  );
}

// SPEC-ski-runs v1.1: a click on a lift opens its card, and picks no start
test("a click on a lift opens its card, the start unchanged", async ({
  page,
}) => {
  await openMap(page);
  expect(await drawnAt(page, 15, ["ski-lifts"])).toBeGreaterThan(0);
  const hit = await bareLine(page, "lift");
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

// SPEC-ski-runs v1.4: the resort card, and the run card's height profile on the map
test("a click on a resort chip opens its card with OpenSkiMap's numbers", async ({
  page,
}) => {
  await openMap(page);
  await page.locator("[data-resort-marker='happo-one']").click();
  const card = page.getByRole("group", {
    name: "Hakuba Happo-One Snow Resort",
  });
  await expect(card).toContainText("Downhill runs");
  await expect(card).toContainText("1 Gondola, 21 Chair lifts");
  // it still picks the resort, as before
  await expect
    .poll(() => new URL(page.url()).searchParams.get("resort"))
    .toBe("happo-one");
});

test("a run's card shows its height profile, and a hover over it puts a ring on the map", async ({
  page,
}) => {
  await openMap(page);
  expect(await drawnAt(page, 15, ["ski-runs"])).toBeGreaterThan(0);
  const hit = await bareLine(page, "run");
  expect(hit, "a run on bare map").not.toBeNull();
  if (!hit) return;
  await page.mouse.click(hit.x, hit.y);
  const card = page.getByRole("group", {
    name: hit.name?.split(", ")[0] || "Unnamed run",
  });
  const chart = card.getByRole("slider", { name: "Height profile" });
  await expect(chart).toBeVisible();
  const ring = page.locator("[data-profile-ring]");
  await expect(ring).toHaveCount(0);
  await chart.hover();
  await expect(ring).toBeVisible();
  await expect(card).toContainText(/\d+ m · \d+° \(\d+%\)/);
  // off the chart, the ring goes
  await page.mouse.move(5, 5);
  await expect(ring).toHaveCount(0);
});

// SPEC-ski-runs v1.5: a picked run or resort is framed in the map its card leaves clear
/**
 * The whole lines (from /api/ski-lines, not the tile-clipped tap) whose vertices are not in
 * the clear map once the camera has settled: off screen, under a panel (the trip card, the
 * side panel) or below the open card's top edge. An empty list means all of them show.
 */
async function hiddenVertices(
  page: Page,
  which: { id: string } | { resortId: string },
) {
  return page.evaluate(async (which) => {
    const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
    if (map.isMoving()) return ["the map is still moving"];
    const { features } = (await (await fetch("/api/ski-lines")).json()) as {
      features: {
        properties: { id: string; resortId: string };
        geometry:
          | { type: "LineString"; coordinates: [number, number][] }
          | { type: "Polygon"; coordinates: [number, number][][] };
      }[];
    };
    const lines = features.filter((f) =>
      "id" in which
        ? f.properties.id === which.id
        : f.properties.resortId === which.resortId,
    );
    const card = document.querySelector("[data-map-card]");
    if (!card || lines.length === 0) return ["no card or no lines"];
    const cardTop = card.getBoundingClientRect().top;
    const hidden: string[] = [];
    for (const f of lines)
      for (const c of f.geometry.type === "LineString"
        ? f.geometry.coordinates
        : f.geometry.coordinates[0]) {
        const { x, y } = map.project(c);
        const el = document.elementFromPoint(x, y);
        // a marker (a resort chip, a hotel pin) on the line is still the map
        const onMap =
          el?.closest(".maplibregl-map") &&
          !el.closest(".maplibregl-control-container");
        if (!onMap || y > cardTop)
          hidden.push(
            `${f.properties.id} at ${Math.round(x)},${Math.round(y)}`,
          );
      }
    return hidden;
  }, which);
}

for (const size of [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "laptop", viewport: { width: 1366, height: 850 }, touch: false },
]) {
  test.describe(`v1.5 on a ${size.name}`, () => {
    test.use({ viewport: size.viewport, hasTouch: size.touch });

    test("a picked run's whole line shows above its card", async ({ page }) => {
      await openMap(page);
      expect(await drawnAt(page, 15, ["ski-runs"])).toBeGreaterThan(0);
      const hit = await bareLine(page, "run");
      expect(hit, "a run on bare map").not.toBeNull();
      if (!hit) return;
      if (size.touch) await page.touchscreen.tap(hit.x, hit.y);
      else await page.mouse.click(hit.x, hit.y);
      await expect(
        page.getByRole("group", {
          name: hit.name?.split(", ")[0] || "Unnamed run",
        }),
      ).toBeVisible();
      await expect(async () => {
        expect(await hiddenVertices(page, { id: hit.id })).toEqual([]);
      }).toPass({ timeout: 10_000 });
    });

    test("a resort chip's card shows all the resort's lines above it", async ({
      page,
    }) => {
      await openMap(page);
      const chip = page.locator("[data-resort-marker='happo-one']");
      // zoomed in on the chip, so most of the resort starts off screen
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      await page.evaluate(
        (at) => {
          const map = (window as unknown as { __hakubaMap: DevMap })
            .__hakubaMap;
          const c = map.unproject(at);
          map.jumpTo({ center: [c.lng, c.lat], zoom: 14 });
        },
        [box.x + box.width / 2, box.y + box.height / 2] as [number, number],
      );
      if (size.touch) await chip.tap();
      else await chip.click();
      await expect(
        page.getByRole("group", { name: "Hakuba Happo-One Snow Resort" }),
      ).toContainText("Downhill runs");
      await expect(async () => {
        expect(await hiddenVertices(page, { resortId: "happo-one" })).toEqual(
          [],
        );
      }).toPass({ timeout: 10_000 });
    });
  });
}
