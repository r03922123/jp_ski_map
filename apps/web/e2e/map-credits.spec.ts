import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * The map credits, OpenStreetMap's included, stay reachable beside the bottom sheet.
 * Hit-tested rather than read from the DOM: a link under the sheet still counts as
 * "visible" to a locator, which is how this went unnoticed (tasks/todo.md, Task J10).
 */

const CREDITS = ".maplibregl-ctrl-attrib";
const INFO_BUTTON = `${CREDITS} summary.maplibregl-ctrl-attrib-button`;

const TRIP = "/?from=36.69711,137.85393&mode=drive&resort=tsugaike";

async function openMap(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

function osmLink(page: Page) {
  return page
    .locator(CREDITS)
    .getByRole("link", { name: /OpenStreetMap/ })
    .first();
}

/** True when a tap at the element's centre (first line, if it wraps) lands on it. */
function isOnTop(el: Locator) {
  return el.evaluate((node) => {
    const r = node.getClientRects()[0];
    if (!r) return false;
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return hit !== null && (node === hit || node.contains(hit));
  });
}

async function expectOnTop(el: Locator) {
  await expect(el).toBeVisible();
  await expect.poll(() => isOnTop(el), { timeout: 5_000 }).toBe(true);
}

const START = "/?from=36.69711,137.85393&mode=drive";

for (const [name, viewport] of [
  ["phone 390x844", { width: 390, height: 844 }],
  ["small phone 320x568", { width: 320, height: 568 }],
  ["phone 360x740", { width: 360, height: 740 }],
  ["landscape phone 740x360", { width: 740, height: 360 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    // OSM's attribution guidelines: shown on first display, then they may fold after
    // five seconds or on map interaction, as long as an (i) brings them back
    test("the credits show on first display, then fold to the info button", async ({
      page,
    }) => {
      await openMap(page);
      await expectOnTop(osmLink(page));
      await expect(osmLink(page)).toBeHidden({ timeout: 10_000 });
      await expectOnTop(page.locator(INFO_BUTTON));
    });

    test("with a start, the credits show above the collapsed sheet, fold, and reopen", async ({
      page,
    }) => {
      await openMap(page, START);
      await expect(page.locator("[data-sheet]")).toHaveAttribute(
        "data-state",
        "collapsed",
      );
      await expectOnTop(osmLink(page));
      await expect(osmLink(page)).toBeHidden({ timeout: 10_000 });
      const button = page.locator(INFO_BUTTON);
      await expectOnTop(button);
      await button.tap();
      await expectOnTop(osmLink(page));
    });
  });
}

test.describe("phone, compact credits", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the info button opens and folds the credits", async ({ page }) => {
    await openMap(page);
    await expect(osmLink(page)).toBeHidden({ timeout: 10_000 });
    const button = page.locator(INFO_BUTTON);

    await button.tap();
    await expectOnTop(osmLink(page));

    await button.tap();
    await expect(osmLink(page)).toBeHidden();
    await expectOnTop(button);
  });

  test("after the sheet expands and collapses, the info button opens the credits above it", async ({
    page,
  }) => {
    await openMap(page, START);
    await expect(osmLink(page)).toBeHidden({ timeout: 10_000 });
    await page.getByRole("button", { name: "Expand directions" }).tap();
    await expect(page.locator("[data-sheet]")).toHaveAttribute(
      "data-state",
      "expanded",
    );

    await page.getByRole("button", { name: "Collapse directions" }).tap();
    await expect(page.locator("[data-sheet]")).toHaveAttribute(
      "data-state",
      "collapsed",
    );
    await page.locator(INFO_BUTTON).tap();
    await expectOnTop(osmLink(page));
  });
});

// the route's fit keeps a strip above the sheet for its end markers: the open credits
// would sit on it, so they fold after their first display and the ⓘ brings them back
for (const [name, viewport] of [
  ["phone 390x844", { width: 390, height: 844 }],
  ["landscape phone 740x360", { width: 740, height: 360 }],
] as const) {
  test.describe(`${name}, with a trip`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test("the credits show first, fold, and the info button reopens them", async ({
      page,
    }) => {
      await openMap(page, TRIP);
      await expectOnTop(osmLink(page));
      await expect(osmLink(page)).toBeHidden({ timeout: 10_000 });
      const button = page.locator(INFO_BUTTON);
      await expectOnTop(button);

      await button.tap();
      await expectOnTop(osmLink(page));
    });
  });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the credits stay open with a trip", async ({ page }) => {
    await openMap(page, TRIP);
    await expectOnTop(osmLink(page));
  });

  test("the credits stay in the corner of the map", async ({ page }) => {
    await openMap(page);
    await expectOnTop(osmLink(page));
    const box = await page.locator(CREDITS).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(800 - 20);
  });
});
