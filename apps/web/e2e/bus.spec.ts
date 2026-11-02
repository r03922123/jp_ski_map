import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { devOnly } from "./dev-only";

// Bus options computed by the real query over the transcribed 2025-26 timetables with
// review simulated (the committed timetables are reviewed=false, so the live API
// answers awaiting_review until a human signs them off).
const MARCH_20 = readFileSync(
  "e2e/fixtures/bus-options-2026-03-20.json",
  "utf8",
);
const HOTEL_HAKUBA = "/?from=36.69711,137.85393&mode=bus";

test("bus tab lists next shuttles and draws the walk to the stop", async ({
  page,
}) => {
  // reduced motion makes fitBounds fire moveend synchronously, which exposed a re-fit loop
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reactErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Maximum update depth|Warning:/.test(m.text()))
      reactErrors.push(m.text().slice(0, 120));
  });
  await page.route("**/api/bus/options**", (route) =>
    route.fulfill({ contentType: "application/json", body: MARCH_20 }),
  );
  await page.goto(HOTEL_HAKUBA);
  await page.getByLabel("Leave after").fill("2026-03-20T08:00");

  const hakuba47 = page.getByRole("region", {
    name: "Hakuba47 Mountain Resort",
  });
  await expect(hakuba47.getByText("08:11 → 08:39")).toBeVisible({
    timeout: 15_000,
  });

  await hakuba47.getByRole("button").first().click();

  await expect(page.getByRole("img", { name: "Bus stop" })).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-route-points",
    "0",
    {
      timeout: 10_000,
    },
  );
  // walk leg + bus ride drawn, with the ride's own time label
  await expect(page.locator("main")).toHaveAttribute(
    "data-route-layers",
    "walk,ride",
    { timeout: 10_000 },
  );
  await expect(page.locator("[data-route-label='ride']")).toHaveText(/28 min/);
  const journey = page.getByRole("list", { name: "Journey" });
  await expect(journey).toContainText("Board 08:11");
  await expect(journey).toContainText("Arrive 08:39");
  // The route is fitted once. Later renders (e.g. the view-change after a pan) must not
  // re-fit it: that snapped the map back, and with reduced motion it looped until React
  // reported "Maximum update depth exceeded".
  await page.waitForTimeout(1500);
  const stop = page.getByRole("img", { name: "Bus stop" });
  const before = await stop.boundingBox();
  const canvas = page.locator("canvas.maplibregl-canvas");
  const box = await canvas.boundingBox();
  if (!before || !box) throw new Error("map not laid out");
  const [x, y] = [box.x + box.width * 0.7, box.y + box.height * 0.5];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 60, y - 40, { steps: 5 });
  await page.mouse.move(x - 120, y - 80, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const after = await stop.boundingBox();
  if (!after) throw new Error("stop marker vanished");
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(80); // stayed where it was dragged
  expect(reactErrors).toEqual([]);
  await expect(page.getByText(/may change without notice/i)).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "Hakuba Valley",
  );
});

type DevMap = {
  queryRenderedFeatures(o: {
    layers: string[];
  }): { properties: { name: string; role: string } }[];
};
const rendered = (page: Page, layer: string) =>
  page.evaluate(
    (id) =>
      (window as unknown as { __hakubaMap: DevMap }).__hakubaMap
        .queryRenderedFeatures({ layers: [id] })
        .map((f) => f.properties),
    layer,
  );

// iPhone QA (2026-11-02): "show all stops on the route, like Google Maps". Every stop of
// the chosen ride is a dot; where you get on and off are named on the map.
test("a chosen bus option shows every stop of the ride, board and alight named", async ({
  page,
}) => {
  devOnly("counts what MapLibre drew through the dev map handle");
  await page.route("**/api/bus/options**", (route) =>
    route.fulfill({ contentType: "application/json", body: MARCH_20 }),
  );
  await page.goto(HOTEL_HAKUBA);
  await page.getByLabel("Leave after").fill("2026-03-20T08:00");
  const hakuba47 = page.getByRole("region", {
    name: "Hakuba47 Mountain Resort",
  });
  await expect(hakuba47.getByText("08:11 → 08:39")).toBeVisible({
    timeout: 15_000,
  });
  await hakuba47.getByRole("button").first().click();
  await expect(page.locator("main")).toHaveAttribute(
    "data-route-layers",
    "walk,ride",
    { timeout: 10_000 },
  );

  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  // Happo Bus Terminal → Nakiyama → Echoland → Hakuba 47 (fixture, to the alighting stop)
  await expect
    .poll(async () => (await rendered(page, "ride-stop-dots")).length, {
      timeout: 10_000,
    })
    .toBe(4);
  const dots = await rendered(page, "ride-stop-dots");
  expect(dots.filter((d) => d.role === "board")).toHaveLength(1);
  expect(dots.filter((d) => d.role === "alight")).toHaveLength(1);
  await expect
    .poll(
      async () =>
        (await rendered(page, "ride-stop-names")).map((f) => f.name).sort(),
      { timeout: 10_000 },
    )
    .toEqual(
      expect.arrayContaining([
        "Hakuba 47 Winter Sports Park",
        "Hakuba Happo Bus Terminal",
      ]),
    );
});

test("an off-season date says there is no shuttle service", async ({
  page,
}) => {
  await page.goto(HOTEL_HAKUBA);
  await page.getByLabel("Leave after").fill("2026-10-29T08:00");

  await expect(page.getByText(/no shuttle service on this date/i)).toBeVisible({
    timeout: 15_000,
  });
});

test("night bus toggle switches to night departures", async ({ page }) => {
  await page.goto(HOTEL_HAKUBA);

  await page.getByLabel("Night bus").check();

  await expect(page.getByText(/night bus/i).first()).toBeVisible();
  await expect(
    page.getByText(/no night bus from nearby stops|towards/i),
  ).toBeVisible({
    timeout: 15_000,
  });
});
