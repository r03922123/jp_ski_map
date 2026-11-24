import { expect, type Page, test } from "@playwright/test";

// SPEC-web-app v1.23 (BC-L2): on a laptop the side card collapses like Google Maps' panel
test.use({ viewport: { width: 1440, height: 900 } });

const onMap = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) =>
      document
        .elementFromPoint(px, py)
        ?.closest(".maplibregl-canvas-container") != null,
    [x, y],
  );

const onTop = (page: Page, name: string) =>
  page.getByRole("button", { name }).evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return { left: r.left, hit: hit !== null && node.contains(hit) };
  });

test("the side card collapses out of the way and comes back, the camera stays", async ({
  page,
}) => {
  await page.goto("/?from=36.6985,137.8376&mode=walk&resort=happo-one");
  await page
    .locator("main[data-map-loaded='true']:not([data-route-points='0'])")
    .waitFor();
  // the collapsed card is invisible, so it leaves the accessibility tree: find it by its attribute
  const card = page.locator("[data-sheet]");
  const box = await card.boundingBox();
  if (!box) throw new Error("no side card");
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  expect(await onMap(page, cx, cy)).toBe(false);
  // let the route fit finish before reading the camera
  await page.waitForTimeout(1000);
  const marker = page.locator(".maplibregl-marker").last();
  const before = await marker.boundingBox();

  await page.getByRole("button", { name: "Collapse side panel" }).click();
  await expect(card).toHaveAttribute("data-panel", "hidden");
  await expect(async () =>
    expect(await onMap(page, cx, cy)).toBe(true),
  ).toPass();
  // after the 200 ms slide, the tab rests at the window's left edge and nothing covers it
  await expect
    .poll(async () => (await onTop(page, "Expand side panel")).left)
    .toBeLessThan(30);
  expect((await onTop(page, "Expand side panel")).hit).toBe(true);
  // the camera didn't move: a marker on the map is where it was
  expect(await marker.boundingBox()).toEqual(before);
  await expect(card.locator("input").first()).not.toBeVisible();

  await page.getByRole("button", { name: "Expand side panel" }).click();
  await expect(card).not.toHaveAttribute("data-panel");
  await expect(async () =>
    expect(await onMap(page, cx, cy)).toBe(false),
  ).toPass();
});

// review of #105: a touch screen makes every button at least 44 px wide (globals.css), and a
// landscape iPhone has a notch on the left; the tabs must grow outward and stay right of it
test.describe("landscape iPhone, notch simulated", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test("the tabs sit beside the card and right of the notch", async ({
    page,
  }) => {
    await page.goto("/?from=36.6985,137.8376&mode=walk&resort=happo-one");
    await page.addStyleTag({
      content:
        ":root { --safe-left: 47px !important; --safe-right: 47px !important; }",
    });
    await page.locator("main[data-map-loaded='true']").waitFor();
    const card = page.locator("[data-sheet]");
    const collapse = page.getByRole("button", { name: "Collapse side panel" });
    const cardBox = await card.boundingBox();
    const tabBox = await collapse.boundingBox();
    if (!cardBox || !tabBox) throw new Error("no card or tab");
    // the touch-screen rule is on: the tab is 44 px wide, not its 24 px
    expect(tabBox.width).toBe(44);
    expect(tabBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width);

    await collapse.tap();
    // after the slide, the tab rests just right of the notch and nothing covers it
    await expect
      .poll(async () => (await onTop(page, "Expand side panel")).left)
      .toBeLessThan(47 + 12);
    const expand = await onTop(page, "Expand side panel");
    expect(expand.left).toBeGreaterThanOrEqual(47);
    expect(expand.hit).toBe(true);
  });
});

// a11y review: Enter on a ranked card scrolled the card out of the window and left focus
// on it, so a keyboard user saw nothing and a screen reader heard no ETA
test("a resort picked from the ranked list by keyboard hands focus to its ETA", async ({
  page,
}) => {
  await page.goto("/?from=36.6985,137.8376&mode=walk");
  // Iwatake: its directions are tall enough to push the card below the window
  const card = page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Iwatake/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const eta = page.getByText(/^ETA ~ \d+/);
  await expect(eta).toBeFocused({ timeout: 15_000 });
  await expect(eta).toBeInViewport();
  await expect(eta).toHaveAttribute("aria-live", "polite");
  // the route's own controls (options, else steps) are the next Tab, not 40 Shift+Tabs back
  await page.keyboard.press("Tab");
  const inRoute = await page.evaluate(
    () =>
      document.activeElement?.closest(
        "[aria-label='Route options'], [aria-label='Steps']",
      ) != null,
  );
  expect(inRoute).toBe(true);
});
