import { expect, test } from "@playwright/test";

// JR Hakuba Station, on foot, looking for a konbini. Needs the API and Valhalla.
const KONBINI_WALK = "/?from=36.6987,137.8617&mode=walk&cat=convenience";

test("konbini on foot: list sorted by ETA, selecting one draws the walk", async ({
  page,
}) => {
  await page.goto(KONBINI_WALK);
  const main = page.locator("main[data-map-loaded='true']");
  await expect(main).toBeAttached({ timeout: 15_000 });
  await expect(page.getByRole("tab", { name: /konbini/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const list = page.getByRole("list", { name: "Nearby places" });
  await expect(list.getByRole("listitem").first()).toBeVisible({
    timeout: 15_000,
  });
  const etas = await list.getByText(/^~ \d+ min/).allTextContents();
  const minutes = etas.map((t) => Number(t.replace(/\D/g, "")));
  expect(minutes.length).toBeGreaterThan(1);
  expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);

  await list.getByRole("button").first().click();

  await expect(main).toHaveAttribute("data-route-layers", /primary/, {
    timeout: 10_000,
  });
  await expect(page.locator("[data-route-label='active']")).toHaveText(
    /🚶 \d+ min/,
  );
  await expect(page.getByRole("img", { name: "Destination" })).toBeVisible();
  await expect(page).toHaveURL(/dest=poi/);
});

test("switching back to resorts restores the resort list", async ({ page }) => {
  await page.goto("/?from=36.6987,137.8617&mode=drive&cat=food");
  await expect(page.getByRole("list", { name: "Nearby places" })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("tab", { name: /resorts/i }).click();

  await expect(
    page
      .getByRole("list", { name: "Ranked resorts" })
      .getByRole("button", { name: /Happo-One/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).not.toHaveURL(/cat=/);
});
