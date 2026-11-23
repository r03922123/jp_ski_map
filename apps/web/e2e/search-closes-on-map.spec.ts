import { type CDPSession, expect, type Page, test } from "@playwright/test";

// Owner's report 2026-11-23: focus the search box (its Recent list opens), then click or
// long-press the map. The pin landed and the box read "Dropped pin", but the list stayed
// open over the panel. Google Maps: any touch on the map closes the suggestions and lets
// go of the box.

const TRIP = "/?from=36.6985,137.8376&mode=drive&resort=happo-one";
const RECENT = [
  {
    id: "test-recent-1",
    kind: "lodging",
    name: "Test Inn",
    nameJa: null,
    coord: { lat: 36.6971, lng: 137.8539 },
    detail: "Hotel",
    match: null,
    source: "index",
  },
];

async function openTrip(page: Page) {
  await page.addInitScript((value) => {
    localStorage.setItem("hakuba:recent-searches", value);
  }, JSON.stringify(RECENT));
  await page.goto(TRIP);
  await expect(
    page.locator("main[data-map-loaded='true']:not([data-route-points='0'])"),
  ).toBeAttached({ timeout: 30_000 });
}

/** A point on bare map (no marker, label or panel over it) near `y`, by hit test. */
async function mapPoint(page: Page, y: number) {
  let found: { x: number; y: number } | null = null;
  await expect(async () => {
    found = await page.evaluate((near) => {
      const w = window.innerWidth;
      for (let dy = 0; dy <= 120; dy += 20)
        for (const x of [0.5, 0.3, 0.7, 0.2, 0.8].map((f) =>
          Math.round(w * f),
        )) {
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

const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search hotel or place" });

async function openRecent(page: Page) {
  await searchBox(page).focus();
  await expect(
    page.getByRole("listbox", { name: "Recent searches" }),
  ).toBeVisible();
}

async function expectClosed(page: Page) {
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(searchBox(page)).not.toBeFocused();
}

test.describe("desktop", () => {
  test("a map click that picks the start closes the Recent list", async ({
    page,
  }) => {
    await openTrip(page);
    await openRecent(page);
    const at = await mapPoint(page, 300);
    await page.mouse.click(at.x, at.y);
    await expect(searchBox(page)).toHaveValue("Dropped pin");
    await expectClosed(page);
  });
});

test.describe("phone", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("a long-press that drops a pin closes the Recent list", async ({
    page,
  }) => {
    await openTrip(page);
    await openRecent(page);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, await mapPoint(page, 220), 700);
    await expect(
      page.getByRole("group", { name: "Dropped pin" }),
    ).toBeVisible();
    await expectClosed(page);
  });

  test("a plain tap on the map closes the Recent list", async ({ page }) => {
    await openTrip(page);
    await openRecent(page);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, await mapPoint(page, 220), 60);
    await expectClosed(page);
  });
});
