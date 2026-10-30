import { expect, test } from "@playwright/test";

test("a starred hotel stays saved after a reload and shows on the map", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await page.getByRole("combobox", { name: /search/i }).fill("Hotel Hakuba");
  await page
    .getByRole("option", { name: /Hotel Hakuba/ })
    .first()
    .click({ timeout: 15_000 });

  const trip = page.getByRole("list", { name: "Trip" });
  await trip.getByRole("button", { name: /^Save Hotel Hakuba/ }).click();
  await page.getByRole("checkbox", { name: /Starred/ }).check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    trip.getByRole("button", { name: /^Saved: Hotel Hakuba/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  // the origin comes back from the URL as a coordinate and is matched to the saved place
  await expect(
    page
      .getByRole("list", { name: "Trip" })
      .getByRole("button", { name: /^Saved: Hotel Hakuba/ }),
  ).toBeVisible();
  await expect(page.locator("[data-saved-marker]")).toHaveCount(1);
});
