import { expect, test } from "@playwright/test";

const SHARED = "/?from=36.69400,137.86900&mode=walk&resort=happo-one";

test("a shared URL restores origin, mode and route", async ({ page }) => {
  await page.goto(SHARED);

  await expect(page.getByRole("tab", { name: /walk/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Resort", { exact: true })).toHaveValue(
    "happo-one",
  );
  await expect(page.getByText(/^ETA ~ \d+ min/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-route-points",
    "0",
  );
});

test("changing the view updates the URL", async ({ page }) => {
  await page.goto(SHARED);
  await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("tab", { name: /drive/i }).click();

  await expect(page).toHaveURL(/mode=drive/);
  await expect(page).toHaveURL(/resort=happo-one/);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("panel is a bottom sheet with no horizontal scroll", async ({
    page,
  }) => {
    await page.goto(SHARED);
    await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });

    const sheet = page.getByRole("region", { name: "Directions" });
    const box = await sheet.boundingBox();
    expect(box && box.y + box.height).toBeCloseTo(844, -1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("sheet handle toggles between collapsed and expanded", async ({
    page,
  }) => {
    await page.goto(SHARED);
    await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /expand directions/i }).click();

    await expect(
      page.getByRole("button", { name: /collapse directions/i }),
    ).toBeVisible();
    // height animates over 200 ms
    const sheet = page.getByRole("region", { name: "Directions" });
    await expect
      .poll(async () => (await sheet.boundingBox())?.height ?? 0)
      .toBeGreaterThan(844 * 0.6);
  });
});
