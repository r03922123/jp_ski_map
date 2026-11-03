import { expect, test } from "@playwright/test";

test("a starred hotel stays saved after a reload and shows on the map", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await page.getByRole("combobox", { name: /search/i }).fill("Hotel Hakuba");
  await page
    .getByRole("option", { name: /Hotel Hakuba/ })
    .first()
    .click({ timeout: 15_000 });

  const trip = page.getByRole("list", { name: "Trip" });
  await trip.getByRole("button", { name: /^Save Hotel Hakuba/ }).click();
  await page.getByRole("checkbox", { name: /Starred/ }).check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    trip.getByRole("button", { name: /^Saved: Hotel Hakuba/ }),
  ).toHaveAttribute("aria-pressed", "true");
  // closing the list picker hands its Back entry back (an async history.back(), T76);
  // a reload racing that traversal is aborted
  await expect
    .poll(() => page.evaluate(() => history.state?.overlay === true))
    .toBe(false);

  await page.reload();
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  // the origin comes back from the URL as a coordinate and is matched to the saved place
  await expect(
    page
      .getByRole("list", { name: "Trip" })
      .getByRole("button", { name: /^Saved: Hotel Hakuba/ }),
  ).toBeVisible();
  await expect(page.locator("[data-saved-marker]")).toHaveCount(1);
});

const HOTEL = {
  id: "osm:node/6312753047",
  name: "Hotel Hakuba",
  coord: { lat: 36.69711, lng: 137.85393 },
  kind: "lodging",
};
const STATION = {
  id: "stop-jr-hakuba",
  name: "JR Hakuba Station",
  coord: { lat: 36.69877, lng: 137.86197 },
  kind: "stop",
};

function seedSaved(page: import("@playwright/test").Page) {
  const state = {
    version: 1,
    lists: [
      {
        id: "starred",
        name: "Starred",
        icon: "star",
        hidden: false,
        builtIn: true,
      },
      {
        id: "favorites",
        name: "Favorites",
        icon: "heart",
        hidden: false,
        builtIn: true,
      },
      {
        id: "want-to-go",
        name: "Want to go",
        icon: "flag",
        hidden: false,
        builtIn: true,
      },
    ],
    places: [
      { ...HOTEL, lists: [], label: "hotel", savedAt: "2026-10-30T00:00:00Z" },
      { ...STATION, lists: ["favorites"], savedAt: "2026-10-30T00:00:01Z" },
    ],
  };
  return page.addInitScript((value) => {
    localStorage.setItem("hakuba:saved", value);
  }, JSON.stringify(state));
}

test("the app opens from My hotel when the link has no starting point", async ({
  page,
}) => {
  await seedSaved(page);
  await page.goto("/");
  await expect(page).toHaveURL(/from=36\.69711%2C137\.85393/);
  await expect(page.getByRole("combobox", { name: /search/i })).toHaveValue(
    "My hotel · Hotel Hakuba",
  );
  await expect(page.getByRole("img", { name: "Starting point" })).toBeVisible();
});

test("Go here on a saved place draws a route to it", async ({ page }) => {
  await seedSaved(page);
  await page.goto("/?mode=drive");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Saved places" }).click();
  await page.getByRole("button", { name: /Favorites/ }).click();
  await page
    .getByRole("listitem", { name: "JR Hakuba Station" })
    .getByRole("button", { name: "Go here" })
    .click();

  await expect(page).toHaveURL(/dest=pt%3A36\.69877%2C137\.86197/);
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-route-points",
    "0",
    { timeout: 15_000 },
  );
  // the destination is the To box's value (SPEC-web-app v1.8), not row text
  await expect(
    page.getByRole("combobox", { name: "To", exact: true }),
  ).toHaveValue("JR Hakuba Station");
});

// {"v":1,"n":"Onsen trip","i":"bookmark","p":[["osm-node-7","Mimizuku no Yu",36.69735,137.84402,"poi"]]}
const IMPORT_CODE = Buffer.from(
  JSON.stringify({
    v: 1,
    n: "Onsen trip",
    i: "bookmark",
    p: [["osm-node-7", "Mimizuku no Yu", 36.69735, 137.84402, "poi"]],
  }),
).toString("base64url");

test("a shared list is imported only after confirming", async ({ page }) => {
  await page.goto(`/#import=${IMPORT_CODE}`);
  const dialog = page.getByRole("dialog", {
    name: /Add 1 place to “Onsen trip”/,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Mimizuku no Yu");
  await dialog.getByRole("button", { name: "Add to Saved" }).click();

  await expect(
    page.getByRole("button", { name: /Onsen trip.*1 place/ }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/#import=/);
  await expect(page.locator('[data-saved-marker="osm-node-7"]')).toHaveCount(1);
});

test("cancelling an import stores nothing", async ({ page }) => {
  await page.goto(`/#import=${IMPORT_CODE}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("hakuba:saved")),
  ).toBeNull();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("list picker and saved panel fit a phone without horizontal scroll", async ({
    page,
  }) => {
    await seedSaved(page);
    await page.goto("/");
    const noHorizontalScroll = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );

    await page
      .getByRole("list", { name: "Trip" })
      .getByRole("button", { name: /Hotel Hakuba/ })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Save to list" }),
    ).toBeVisible();
    expect(await noHorizontalScroll()).toBe(true);
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Saved places" }).click();
    await expect(page.getByRole("region", { name: "Saved" })).toBeVisible();
    expect(await noHorizontalScroll()).toBe(true);
  });
});
