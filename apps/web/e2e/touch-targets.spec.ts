import { expect, type Page, test } from "@playwright/test";

// T75 (QA on a real iPhone): a tap on the HUD's Rider button landed on Quests next to
// it. On touch screens every control is at least 44×44 CSS px (Apple's 44 pt; Android's
// 48 dp is ~44 CSS px at common densities). Exempt, as WCAG 2.5.8 allows: links inside
// a line of text (map attribution, the timetable link), and the map's own annotations
// (resort markers, route time labels), which are wide and spaced by the map.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

const MIN = 44;

async function tooSmall(page: Page) {
  return page.evaluate((min) => {
    const controls = document.querySelectorAll(
      'button, a[href], [role="tab"], [role="button"], summary, select, input:not([type="hidden"])',
    );
    const out: string[] = [];
    for (const el of controls) {
      if (el.closest(".maplibregl-marker, [data-touch-exempt]")) continue;
      // a link in a line of text
      if (el.tagName === "A" && getComputedStyle(el).display === "inline")
        continue;
      // a checkbox or radio is tapped through its label
      const target =
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio")
          ? (el.closest("label") ?? el)
          : el;
      const r = target.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // visually hidden
      if (r.bottom < 0 || r.top > innerHeight) continue;
      if (getComputedStyle(target).visibility === "hidden") continue;
      if (r.width >= min && r.height >= min) continue;
      const name = (
        el.getAttribute("aria-label") ||
        el.textContent ||
        el.tagName
      )
        .trim()
        .slice(0, 40);
      out.push(`${name} (${Math.round(r.width)}×${Math.round(r.height)})`);
    }
    return out;
  }, MIN);
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

async function expandSheet(page: Page) {
  await page.getByRole("button", { name: /expand directions/i }).click();
  const sheet = page.getByRole("region", { name: "Directions" });
  await expect(sheet).toHaveAttribute("data-state", "expanded");
  await expect
    .poll(async () => (await sheet.boundingBox())?.height ?? 0)
    .toBeGreaterThan(844 * 0.7);
}

test("drive: the resort list, HUD, tabs and map controls are big enough", async ({
  page,
}) => {
  await open(page, "/?from=36.6985,137.8376&mode=drive");
  await expect(page.getByRole("list", { name: "Ranked resorts" })).toBeVisible({
    timeout: 15_000,
  });
  expect(await tooSmall(page)).toEqual([]);
  await expandSheet(page);
  expect(await tooSmall(page)).toEqual([]);
});

test("walk with a route: start/destination rows and Add destination", async ({
  page,
}) => {
  await open(page, "/?from=36.69400,137.86900&mode=walk&resort=happo-one");
  await expect(page.getByText(/^ETA ~/)).toBeVisible({ timeout: 15_000 });
  await expandSheet(page);
  expect(await tooSmall(page)).toEqual([]);
});

test("bus: date, time and the options", async ({ page }) => {
  await open(page, "/?from=36.69711,137.85393&mode=bus");
  await expandSheet(page);
  expect(await tooSmall(page)).toEqual([]);
});

test("the rider card and the quest log", async ({ page }) => {
  await open(page, "/");
  // v1.9: the game HUD shows once the sheet is swiped up (the resting sheet holds the answer)
  await expandSheet(page);
  await page.getByRole("button", { name: /^Rider card/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await tooSmall(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Quests/ }).click();
  expect(await tooSmall(page)).toEqual([]);
});

test("HUD buttons are spaced: a tap between Rider and Quests hits neither twice", async ({
  page,
}) => {
  await open(page, "/");
  await expandSheet(page); // v1.9: the HUD shows in the swiped-up sheet
  const rider = await page
    .getByRole("button", { name: /^Rider card/ })
    .boundingBox();
  const quests = await page
    .getByRole("button", { name: /^Quests/ })
    .boundingBox();
  if (!rider || !quests) throw new Error("HUD not laid out");
  expect(quests.x - (rider.x + rider.width)).toBeGreaterThanOrEqual(8);
});

test("the sheet handle can be grabbed above its thin bar too", async ({
  page,
}) => {
  await open(page, "/");
  const sheet = await page
    .getByRole("region", { name: "Directions" })
    .boundingBox();
  if (!sheet) throw new Error("no sheet");
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x, y)
        ?.closest("button")
        ?.getAttribute("aria-label"),
    [sheet.x + sheet.width / 2, sheet.y - 12],
  );
  expect(hit).toMatch(/expand directions/i);
});
