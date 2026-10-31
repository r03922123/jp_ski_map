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

test.describe("iPhone zoom-on-focus", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("form fields use at least 16px text on touch devices, so iOS doesn't zoom in", async ({
    page,
  }) => {
    await page.goto("/?from=36.69711,137.85393&mode=bus");
    await expect(page.locator("#depart-at")).toBeVisible({ timeout: 15_000 });
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll("input, select, textarea")]
        .filter((el) => (el as HTMLInputElement).type !== "checkbox")
        .map((el) => ({
          field: el.getAttribute("aria-label") ?? el.id ?? el.tagName,
          px: Number.parseFloat(getComputedStyle(el).fontSize),
        })),
    );
    expect(sizes.length).toBeGreaterThan(1);
    expect(sizes.filter((s) => s.px < 16)).toEqual([]);
  });
});

test("on a laptop the search box keeps its compact text", async ({ page }) => {
  await page.goto("/");
  const px = await page
    .getByRole("combobox", { name: /search/i })
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBe(14);
});

// T74: Android sends no click after a moving touch; the swipe itself must move the sheet
test.describe("sheet swipe on touch", () => {
  test.use({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });

  test("swiping the handle up expands the sheet, down collapses it", async ({
    page,
  }) => {
    await page.goto(SHARED);
    await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });
    const sheet = page.getByRole("region", { name: "Directions" });
    const handle = page.getByRole("button", {
      name: /(expand|collapse) directions/i,
    });
    const cdp = await page.context().newCDPSession(page);

    async function swipe(dy: number) {
      const box = await handle.boundingBox();
      if (!box) throw new Error("no sheet handle");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const point = (py: number) => [{ x, y: py, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: point(y),
      });
      for (let i = 1; i <= 5; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: point(y + (dy * i) / 5),
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }

    await swipe(-150);
    await expect(sheet).toHaveAttribute("data-state", "expanded");
    // the handle rides the sheet's 200 ms height animation; swipe once it has settled
    await expect
      .poll(async () => (await sheet.boundingBox())?.height ?? 0)
      .toBeGreaterThan(915 * 0.75);
    await swipe(150);
    await expect(sheet).toHaveAttribute("data-state", "collapsed");
  });
});
