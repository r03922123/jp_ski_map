import { type CDPSession, expect, type Page, test } from "@playwright/test";

// Cluster A (docs/ux/2026-11-03-ux-review.md): on a phone one tap on the map replaced the
// start with "Dropped pin". Google Maps (docs/ux/behaviour-cards.md BC-A1): a tap changes
// nothing; a long-press drops a pin whose card offers the edits. Real touch events (CDP),
// so MapLibre and the browser see a finger, not a mouse.
test.use({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
});

const TRIP = "/?from=36.6985,137.8376&mode=drive&resort=happo-one";

async function openTrip(page: Page) {
  await page.goto(TRIP);
  await expect(
    page.locator("main[data-map-loaded='true']:not([data-route-points='0'])"),
  ).toBeAttached({ timeout: 30_000 });
}

/**
 * A point on bare map (no marker, label or panel over it) near `y`, by hit test, once
 * the camera has settled on the route.
 */
async function mapPoint(page: Page, y: number) {
  let found: { x: number; y: number } | null = null;
  await expect(async () => {
    found = await page.evaluate((near) => {
      for (let dy = 0; dy <= 120; dy += 20)
        for (const x of [200, 120, 280, 80, 320]) {
          const py = near + dy;
          const hit = document.elementFromPoint(x, py);
          if (hit?.classList.contains("maplibregl-canvas")) return { x, y: py };
        }
      return null;
    }, y);
    expect(found, `bare map near y=${y}`).not.toBeNull();
  }).toPass({ timeout: 10_000 });
  return found as unknown as { x: number; y: number };
}

async function touch(
  cdp: CDPSession,
  at: { x: number; y: number },
  holdMs: number,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...at, id: 1 }],
  });
  await new Promise((r) => setTimeout(r, holdMs));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

const fromParam = (page: Page) => new URL(page.url()).searchParams.get("from");

test("a tap on the map keeps the start", async ({ page }) => {
  await openTrip(page);
  const cdp = await page.context().newCDPSession(page);
  const before = fromParam(page);
  await touch(cdp, await mapPoint(page, 220), 60);
  // longer than the double-tap window a pick used to wait out
  await page.waitForTimeout(800);
  expect(fromParam(page)).toBe(before);
  await expect(page.getByRole("group", { name: "Dropped pin" })).toHaveCount(0);
});

test("a long-press drops a pin; Start here makes it the start", async ({
  page,
}) => {
  await openTrip(page);
  const cdp = await page.context().newCDPSession(page);
  const before = fromParam(page);
  await touch(cdp, await mapPoint(page, 220), 700);
  const card = page.getByRole("group", { name: "Dropped pin" });
  await expect(card).toBeVisible();
  // the press alone edits nothing
  expect(fromParam(page)).toBe(before);
  await card.getByRole("button", { name: "Start here" }).tap();
  await expect(card).toHaveCount(0);
  await expect.poll(() => fromParam(page)).not.toBe(before);
});

test("a long-press then a tap elsewhere closes the card, start unchanged", async ({
  page,
}) => {
  await openTrip(page);
  const cdp = await page.context().newCDPSession(page);
  const before = fromParam(page);
  await touch(cdp, await mapPoint(page, 220), 700);
  await expect(page.getByRole("group", { name: "Dropped pin" })).toBeVisible();
  await touch(cdp, await mapPoint(page, 330), 60);
  await expect(page.getByRole("group", { name: "Dropped pin" })).toHaveCount(0);
  expect(fromParam(page)).toBe(before);
});
