import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

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
  await expect(page.getByText(/may change without notice/i)).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "Hakuba Valley",
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
