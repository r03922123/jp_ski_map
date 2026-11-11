import { expect, type Page, test } from "@playwright/test";

/**
 * Phones: the directions sheet waits for a start. With no start it holds only a hint,
 * so it stays off the map; the search card on top stays. A start from search, a shared
 * link or My hotel brings it up, and so does the Saved list (tasks/todo.md, Task J13).
 */

const sheet = (page: Page) => page.locator("[data-sheet]");
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search hotel or place" });

async function openMap(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

test.describe("phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("no start: the sheet is hidden and the search card stays", async ({
    page,
  }) => {
    await openMap(page, "/");
    await expect(searchBox(page)).toBeVisible();
    await expect(sheet(page)).toBeHidden();
    await expect(page.getByRole("tab", { name: /Drive/ })).toBeHidden();
    // with no sheet to clear, the credits stay down in the map's corner
    const credits = await page.locator(".maplibregl-ctrl-attrib").boundingBox();
    expect((credits?.y ?? 0) + (credits?.height ?? 0)).toBeGreaterThan(
      844 - 40,
    );
  });

  test("a mode link with no start keeps its mode for when the start is set", async ({
    page,
  }) => {
    await openMap(page, "/?mode=bus");
    await expect(sheet(page)).toBeHidden();

    await searchBox(page).fill("Hakuba Tokyu");
    await page.getByRole("option", { name: /Tokyu/ }).first().tap();

    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole("tab", { name: /Bus/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a shared link with a start shows the sheet", async ({ page }) => {
    await openMap(page, "/?from=36.69711,137.85393&mode=drive");
    await expect(sheet(page)).toBeVisible();
    await expect(sheet(page)).toHaveAttribute("data-state", "collapsed");
  });

  // the stops a cleared start leaves stay listed in the sheet, with their ✕
  test("stops with no start keep the sheet", async ({ page }) => {
    await openMap(page, "/?mode=drive&stops=36.74000,137.87000");
    await expect(sheet(page)).toBeVisible();
  });

  test("Saved opens the sheet without a start, and closing it hides it again", async ({
    page,
  }) => {
    await openMap(page, "/");
    await page.getByRole("button", { name: "Saved places" }).tap();
    await expect(sheet(page)).toBeVisible();

    await page.getByRole("button", { name: "Saved places" }).tap();
    await expect(sheet(page)).toBeHidden();
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // from md up the sheet is the side card that holds the search box: it stays
  test("no start: the side card stays", async ({ page }) => {
    await openMap(page, "/");
    await expect(sheet(page)).toBeVisible();
  });
});
