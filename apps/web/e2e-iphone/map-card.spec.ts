import { expect, test } from "@playwright/test";

// A picked card's title on WebKit: a floated <legend> stays inside its fieldset in Chromium,
// but WebKit drew it on the fieldset's top edge, above the card (seen on an iPhone, 2026-11-25).
// The box still holds such a legend (the background starts at its middle), so check the
// card's top padding sits above the title.
const NAME = "Hakuba Happo-One Snow Resort";

test("a resort card's title sits inside the card", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
  const chip = await page
    .locator("[data-resort-marker='happo-one']")
    .boundingBox();
  if (!chip) throw new Error("no Happo-One chip on the map");
  await page.touchscreen.tap(chip.x + chip.width / 2, chip.y + chip.height / 2);
  const card = page.getByRole("group", { name: NAME });
  await expect(card.getByText("Downhill runs")).toBeVisible();
  const box = await card.boundingBox();
  const title = await card.getByText(NAME, { exact: true }).boundingBox();
  if (!box || !title) throw new Error("card or title not laid out");
  expect(title.y - box.y).toBeGreaterThanOrEqual(8);
});
