import { expect, test } from "@playwright/test";

// The local index via the API (started by playwright.config); Photon only as fallback.
test("search a hotel by name sets the origin and shows lodging pins", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });

  const search = page.getByRole("combobox", { name: /search/i });
  await search.fill("Hotel Hakuba");
  await page
    .getByRole("option", { name: /Hotel Hakuba/ })
    .first()
    .click({ timeout: 15_000 });

  await expect(page.getByRole("img", { name: "Starting point" })).toBeVisible();
  await expect(page).toHaveURL(/from=36\.697\d*%2C137\.853/);

  // flying to the hotel zooms to 14, where lodging pins load from the snapshot
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-lodging-pins",
    "0",
    { timeout: 10_000 },
  );
});

test("pasting a Google Maps link sets the origin without a text search", async ({
  page,
}) => {
  await page.goto("/");
  const link =
    "https://www.google.com/maps/place/Phoenix+Hotel/@36.70,137.84,17z/data=!3d36.70150!4d137.84410";

  await page.getByRole("combobox", { name: /search/i }).fill(link);
  await page.getByRole("option", { name: /phoenix hotel/i }).click();

  await expect(page).toHaveURL(/from=36\.70150%2C137\.84410/);
});
