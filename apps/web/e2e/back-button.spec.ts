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

/** The destination's Save star opens the Save to list dialog (an overlay with Back). */
async function openSaveToList(page: Page) {
  await page
    .getByRole("button", { name: "Save Hakuba Happo-One" })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Save to list" }),
  ).toBeVisible();
}

test("Back closes the Save to list dialog and keeps the trip", async ({
  page,
}) => {
  await open(page);
  await openSaveToList(page);

  await back(page);
  await expect(page.getByRole("dialog", { name: "Save to list" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);
  await expect(page).toHaveURL(/from=36\.694/);
});

test("closing with Done leaves no extra Back step behind", async ({ page }) => {
  await open(page);
  await openSaveToList(page);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Save to list" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);

  // the next Back leaves the app, as it would had the dialog never opened
  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});
