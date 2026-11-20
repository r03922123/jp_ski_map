import { expect, test } from "@playwright/test";

// SPEC-web-app v1.24: each mode tab shows its time; a walk over an hour must still fit a 320 px phone
test.use({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
});

test("the mode tabs fit a 320 px phone with a walk over an hour", async ({
  page,
}) => {
  // Tsugaike is a long walk from Hakuba Station (≈1 h 36 min on 2026-11-20)
  await page.goto("/?from=36.6985,137.8376&mode=drive&resort=tsugaike");
  const walk = page.getByRole("tab", { name: /Walk \d+ h/ });
  await expect(walk).toBeVisible({ timeout: 15_000 });
  const fits = await page
    .getByRole("tablist")
    .first()
    .evaluate((list) =>
      [list, ...list.querySelectorAll("[role=tab]")].every(
        (el) => el.scrollWidth <= el.clientWidth,
      ),
    );
  expect(fits).toBe(true);
});
