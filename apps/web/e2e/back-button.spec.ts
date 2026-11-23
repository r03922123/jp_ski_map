import { expect, type Page, test } from "@playwright/test";

// T76: Back with an overlay open closes the overlay; it must not leave the trip.
const TRIP = "/?from=36.69400,137.86900&mode=walk&resort=happo-one";

async function open(page: Page, url = TRIP) {
  // a page before the app, so a Back too many would visibly leave it
  await page.goto("/robots.txt");
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
}

const back = (page: Page) => page.evaluate(() => history.back());
const entries = (page: Page) => page.evaluate(() => history.length);
async function stepPushed(page: Page, before: number) {
  await expect.poll(() => entries(page)).toBe(before + 1);
}
const nextPop = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        addEventListener("popstate", () => done(), { once: true }),
      ),
  );

/** The destination's Save star opens the Save to list dialog (an overlay with Back). */
async function openSaveToList(page: Page) {
  await page
    .getByRole("button", { name: "Save Hakuba Happo-One" })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Save to list" }),
  ).toBeVisible();
}

test("Back closes the Save to list dialog and keeps the trip", async ({
  page,
}) => {
  await open(page);
  await openSaveToList(page);

  await back(page);
  await expect(page.getByRole("dialog", { name: "Save to list" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);
  await expect(page).toHaveURL(/from=36\.694/);
});

test("closing with Done leaves no extra Back step behind", async ({ page }) => {
  await open(page);
  await openSaveToList(page);
  const tookBack = nextPop(page);
  await page.getByRole("button", { name: "Done" }).click();
  await tookBack;
  await expect(page.getByRole("dialog", { name: "Save to list" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);

  // the next Back leaves the app, as it would had the dialog never opened
  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test("Back closes the Saved panel and keeps the trip", async ({ page }) => {
  await open(page);
  const before = await entries(page);
  await page.getByRole("button", { name: "Saved places" }).click();
  await expect(page.getByRole("region", { name: "Saved" })).toBeVisible();
  await stepPushed(page, before);

  await back(page);
  await expect(page.getByRole("region", { name: "Saved" })).toBeHidden();
  await expect(page).toHaveURL(/resort=happo-one/);

  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test("Back steps back from a first-chosen destination, once", async ({
  page,
}) => {
  await open(page, "/?from=36.69400,137.86900&mode=drive");
  const before = await entries(page);
  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Happo-One/ })
    .click({ timeout: 15_000 });
  await expect(page).toHaveURL(/resort=happo-one/);
  await page.getByRole("tab", { name: /walk/i }).click();
  await expect(page).toHaveURL(/mode=walk/);
  await stepPushed(page, before);

  await back(page);
  await expect(page).not.toHaveURL(/resort=/);
  await expect(page).toHaveURL(/from=36\.694/);
  await expect(page.getByRole("img", { name: "Starting point" })).toBeVisible();

  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test("removing the destination in the app leaves no extra Back step", async ({
  page,
}) => {
  await open(page, "/?from=36.69400,137.86900&mode=drive");
  const before = await entries(page);
  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Happo-One/ })
    .click({ timeout: 15_000 });
  await stepPushed(page, before);

  const tookBack = nextPop(page);
  await page.getByRole("button", { name: "Remove destination" }).click();
  await tookBack;
  await expect(page).not.toHaveURL(/resort=/);

  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test("Go here in Saved leaves one Back step, which clears the destination", async ({
  page,
}) => {
  const station = {
    id: "stop-jr-hakuba",
    name: "JR Hakuba Station",
    coord: { lat: 36.69877, lng: 137.86197 },
    kind: "stop",
    lists: ["starred"],
    savedAt: "2026-10-30T00:00:00Z",
  };
  const saved = {
    version: 1,
    lists: [
      {
        id: "starred",
        name: "Starred",
        icon: "star",
        hidden: false,
        builtIn: true,
      },
    ],
    places: [station],
  };
  await page.addInitScript((value) => {
    localStorage.setItem("hakuba:saved", value);
  }, JSON.stringify(saved));
  await open(page, "/?from=36.69400,137.86900&mode=walk");
  await page.getByRole("button", { name: "Saved places" }).click();
  await page.getByRole("button", { name: /Starred/ }).click();
  const before = await entries(page);
  const tookBack = nextPop(page);
  await page
    .getByRole("listitem", { name: "JR Hakuba Station" })
    .getByRole("button", { name: "Go here" })
    .click();
  await expect(page).toHaveURL(/dest=pt/);
  await expect(page.getByRole("region", { name: "Saved" })).toBeHidden();
  await tookBack;
  await stepPushed(page, before);

  await back(page);
  await expect(page).not.toHaveURL(/dest=/);
  await expect(page).toHaveURL(/from=36\.694/);

  await back(page);
  await expect(page).toHaveURL(/robots\.txt$/);
});

test.describe("navigating on a phone", () => {
  const HOTEL_HAKUBA = { latitude: 36.69711, longitude: 137.85393 };
  test.use({
    isMobile: true,
    hasTouch: true,
    permissions: ["geolocation"],
    geolocation: HOTEL_HAKUBA,
  });

  test("Back ends navigation and keeps the trip", async ({ page }) => {
    await open(
      page,
      `/?from=${HOTEL_HAKUBA.latitude},${HOTEL_HAKUBA.longitude}&mode=walk&dest=pt:36.69877,137.86197`,
    );
    const before = await entries(page);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    await expect(page.getByTestId("pilot")).toBeVisible();
    await stepPushed(page, before);

    await back(page);
    await expect(page.getByTestId("pilot")).toHaveCount(0);
    await expect(page).toHaveURL(/dest=pt/);

    await back(page);
    await expect(page).toHaveURL(/robots\.txt$/);
  });
});
