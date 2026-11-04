import { expect, type Page, test } from "@playwright/test";

// SPEC-web-app v1.8 (the To box) and v1.7 (touch: a tap looks, a long-press drops a pin)
// on WebKit with iPhone emulation: the engine of every iOS browser.
const STATION = "36.69877,137.86197";
const TRIP = `/?from=${STATION}&mode=drive&resort=happo-one`;
const SHOTS = process.env.IPHONE_SHOTS; // a folder for screenshots, when set

const toBox = (page: Page) =>
  page.getByRole("combobox", { name: "To", exact: true });
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);

async function openTrip(page: Page) {
  await page.goto(TRIP);
  await expect(
    page.locator("main[data-map-loaded='true']:not([data-route-points='0'])"),
  ).toBeAttached({ timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  if (SHOTS)
    await page.screenshot({
      path: `${SHOTS}/${test.info().project.name}-${name}.png`,
    });
}

/** A point on bare map (no marker, label or panel) near `y`, by hit test. */
async function mapPoint(page: Page, y: number) {
  let found: { x: number; y: number } | null = null;
  await expect(async () => {
    found = await page.evaluate((near) => {
      for (let dy = 0; dy <= 120; dy += 20)
        // fractions of the width: on an iPad the side card covers the left part
        for (const x of [0.5, 0.3, 0.7, 0.85, 0.2].map((f) =>
          Math.round(innerWidth * f),
        )) {
          const hit = document.elementFromPoint(x, near + dy);
          if (hit?.classList.contains("maplibregl-canvas"))
            return { x, y: near + dy };
        }
      return null;
    }, y);
    expect(found).not.toBeNull();
  }).toPass({ timeout: 10_000 });
  return found as unknown as { x: number; y: number };
}

/** A finger held on the map: WebKit has no CDP touch, so real TouchEvents from the page. */
async function longPress(page: Page, at: { x: number; y: number }, ms = 700) {
  await page.evaluate(
    async ({ x, y, ms }) => {
      const target = document.elementFromPoint(x, y) as Element;
      // WebKit refuses `new Touch()`; iOS's legacy document.createTouch still works
      const doc = document as unknown as {
        createTouch: (...a: unknown[]) => Touch;
      };
      const touch = doc.createTouch(window, target, 1, x, y, x, y);
      const fire = (type: string, touches: Touch[]) =>
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: [touch],
          }),
        );
      fire("touchstart", [touch]);
      await new Promise((r) => setTimeout(r, ms));
      fire("touchend", []);
    },
    { ...at, ms },
  );
}

test("v1.8: the To box is in view as the trip opens", async ({ page }) => {
  // fixed: T-fold — v1.9 puts From/To in a card on top (BC-L1); it was cut off at the
  // collapsed sheet's bottom edge on Safari-sized screens
  await openTrip(page);
  await expect(toBox(page)).toBeInViewport({ ratio: 1 });
  await expect(toBox(page)).toHaveValue(/Happo-One/);
  await shot(page, "1-trip");
});

test("v1.8: typing Cortina in To and tapping it changes the destination, not the start", async ({
  page,
}) => {
  await openTrip(page);
  await toBox(page).tap();
  await toBox(page).fill("Cortina");
  const option = page
    .getByRole("option", { name: /Hakuba Cortina Snow Resort/ })
    .first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await shot(page, "2-suggestions");
  await option.tap();
  await expect.poll(() => param(page, "resort")).toBe("cortina");
  expect(param(page, "from")).toBe(STATION);
  await expect(toBox(page)).toHaveValue(/Hakuba Cortina/);
  // a pick lets go of the box, so the iOS keyboard closes (Google does the same)
  await expect(toBox(page)).not.toBeFocused();
  await shot(page, "3-picked");
});

test("v1.8: typing in To, then leaving it (the iOS keyboard's Done), puts the destination's name back", async ({
  page,
}) => {
  await openTrip(page);
  await toBox(page).tap();
  await toBox(page).fill("Cort");
  await toBox(page).evaluate((el) => (el as HTMLInputElement).blur());
  await expect(toBox(page)).toHaveValue(/Happo-One/);
  expect(param(page, "resort")).toBe("happo-one");
});

test("v1.8: Japanese typing in To finds the resort", async ({ page }) => {
  await openTrip(page);
  await toBox(page).tap();
  await toBox(page).fill("コルチナ");
  await expect(
    page.getByRole("option", { name: /Hakuba Cortina/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test("v1.8: the To box text is at least 16 px, so iOS doesn't zoom in on focus", async ({
  page,
}) => {
  await openTrip(page);
  const size = await toBox(page).evaluate((el) =>
    Number.parseFloat(getComputedStyle(el).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(16);
});

test("v1.7: a tap on the map keeps the start", async ({ page }) => {
  await openTrip(page);
  const at = await mapPoint(page, 120);
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForTimeout(800);
  expect(param(page, "from")).toBe(STATION);
  await expect(page.getByRole("group", { name: "Dropped pin" })).toHaveCount(0);
});

test("v1.7: a long-press drops a pin card; Go here makes it the destination", async ({
  page,
}) => {
  // Desktop WebKit refuses synthetic touches (`new Touch()` is an illegal constructor and
  // createTouch lists are rejected). Covered by real CDP touch in e2e/pin-card.spec.ts and
  // the real-iPhone Chrome check (2026-11-03); real Safari is still to check.
  test.fixme(true, "WebKit emulation cannot hold a finger down");
  await openTrip(page);
  await longPress(page, await mapPoint(page, 120));
  const card = page.getByRole("group", { name: "Dropped pin" });
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport({ ratio: 1 });
  await shot(page, "4-pin-card");
  expect(param(page, "from")).toBe(STATION);
  await card.getByRole("button", { name: "Go here" }).tap();
  await expect(page).toHaveURL(/dest=pt%3A/);
  expect(param(page, "from")).toBe(STATION);
});
