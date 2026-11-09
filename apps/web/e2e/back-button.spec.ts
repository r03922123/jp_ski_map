import { expect, type Page, test } from "@playwright/test";

// T76: Back with an overlay open closes the overlay; it must not leave the trip.
const TRIP = "/?from=36.69400,137.86900&mode=walk&resort=happo-one";

async function open(page: Page, url = TRIP) {
  // a page before the app, so a Back too many would visibly leave it
  await page.goto("/robots.txt");
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

const back = (page: Page) => page.evaluate(() => history.back());

test("Back closes the rider card and keeps the trip", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Rider card/ }).click();
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeVisible();

  await back(page);
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);
  await expect(page).toHaveURL(/from=36\.694/);
});

test("Back closes the quest log", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Quests/ }).click();
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toBeVisible();

  await back(page);
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);
});

test("closing with ✕ leaves no extra Back step behind", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /^Rider card/ }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);

  // the next Back leaves the app, as it would had the card never opened
  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test("a start picked while the quest log is open survives Back", async ({
  page,
}) => {
  // no destination: with both ends set a click changes nothing (v1.13 rule 8)
  await open(page, "/?from=36.69400,137.86900&mode=walk");
  await page.getByRole("button", { name: /^Quests/ }).click();
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  if (!box) throw new Error("no map");
  await page.mouse.click(box.x + box.width - 80, box.y + 80);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("from"))
    .not.toBe("36.69400,137.86900");
  const moved = new URL(page.url()).searchParams.get("from");

  await back(page);
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toBeHidden();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("from"))
    .toBe(moved);
});

test("with two overlays open, each Back closes the top one", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: /^Quests/ }).click();
  await page.getByRole("button", { name: /^Rider card/ }).click();
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeVisible();

  await back(page);
  await expect(page.getByRole("dialog", { name: "Rider card" })).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toBeVisible();

  await back(page);
  await expect(
    page.getByRole("region", { name: "Today's quests" }),
  ).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);
});
