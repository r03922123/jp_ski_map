import { expect, test } from "@playwright/test";

// SPEC-progression v1.6: today's quests come from real data and finish by being there.
const CORTINA_BASE = { latitude: 36.77721, longitude: 137.88832 };

// a powder day at Cortina (live snow data changes daily; the rule is what's tested)
const snowDay = (cmAtCortina: number) =>
  ["cortina", "happo-one"].map((resortId) => ({
    resortId,
    asOf: "2026-01-02T09:00:00+09:00",
    depthCm: { base: 80, summit: 200, source: "model" },
    newSnowCm: {
      past24h: resortId === "cortina" ? cmAtCortina : 4,
      past72h: 30,
      next24h: 0,
      next72h: 0,
    },
    tempC: { summitMin: -9, summitMax: -4 },
  }));

test.use({ permissions: ["geolocation"], geolocation: CORTINA_BASE });

test("a powder day at the nearest new world: checking in there finishes both quests", async ({
  page,
}) => {
  await page.route("**/api/snow", (route) =>
    route.fulfill({ json: snowDay(25) }),
  );
  await page.goto("/?from=36.69711,137.85393&mode=drive");

  await page
    .getByRole("button", { name: /^Quests, 3 open/ })
    .click({ timeout: 15_000 });
  const log = page.getByRole("region", { name: "Today's quests" });
  await expect(log).toContainText("25 cm fell at Hakuba Cortina Snow Resort");
  await expect(log).toContainText("Explore Hakuba Cortina Snow Resort"); // W1, nothing stamped yet
  await expect(log).toContainText("Stop at a konbini on the way");

  const card = page.getByRole("listitem").filter({ hasText: "Hakuba Cortina" });
  await card.getByText("Details").click();
  await card.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Stamp earned!").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "OK", exact: true }).click();

  await expect(
    page.getByRole("button", { name: /^Quests, 1 open/ }),
  ).toBeVisible();
  await expect(log.getByText("(done)")).toHaveCount(2);

  // the day's quests are kept: a reload doesn't swap "Explore" for the next world
  await page.reload();
  await page
    .getByRole("button", { name: /^Quests, 1 open/ })
    .click({ timeout: 15_000 });
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toContainText("Explore Hakuba Cortina Snow Resort");
});

test("no fresh snow worth riding: no powder quest", async ({ page }) => {
  await page.route("**/api/snow", (route) =>
    route.fulfill({ json: snowDay(6) }),
  );
  await page.goto("/?from=36.69711,137.85393&mode=drive");
  await page
    .getByRole("button", { name: /^Quests, 2 open/ })
    .click({ timeout: 15_000 });
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).not.toContainText("cm fell");
});
