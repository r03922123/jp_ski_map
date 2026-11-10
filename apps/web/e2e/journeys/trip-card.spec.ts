import { expect, type Page, test } from "@playwright/test";

/**
 * Journey: THE TRIP CARD (SPEC-web-app v1.13). Two equal boxes joined by a rail, with ⇅
 * beside them and "Add destination" under them. Needs the API and Valhalla running.
 */

test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station
const TRIP = `/?from=${STATION}&mode=drive&resort=happo-one`;
const BUS_TRIP = `/?from=${STATION}&mode=bus&resort=happo-one`;

const DEVICES = [
  {
    name: "phone 393x852",
    use: {
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    },
  },
  { name: "laptop 1440x900", use: { viewport: { width: 1440, height: 900 } } },
];

const fromBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search hotel or place" });
const toBox = (page: Page) => page.getByRole("combobox", { name: "To" });
const swap = (page: Page) =>
  page.getByRole("button", { name: "Swap start and destination" });
const addDestination = (page: Page) =>
  page.getByRole("button", { name: "Add destination" });
const saved = (page: Page) =>
  page.getByRole("button", { name: "Saved places" });
const routeReady = (page: Page) =>
  expect(page.getByText(/^ETA ~ \d+/)).toBeVisible({ timeout: 20_000 });
const boxOf = async (page: Page, name: "from" | "to" | "swap" | "saved") => {
  const locator = {
    from: fromBox,
    to: toBox,
    swap,
    saved,
  }[name](page);
  await expect(locator).toBeVisible({ timeout: 15_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name} has no box`);
  return box;
};

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use(device.use);

    test("a fresh page has one bar, with ★ Saved beside it", async ({
      page,
    }) => {
      await page.goto("/");
      const from = await boxOf(page, "from");
      const star = await boxOf(page, "saved");

      await expect(toBox(page)).toHaveCount(0);
      await expect(swap(page)).toHaveCount(0);
      expect(star.x).toBeGreaterThan(from.x + from.width - 1);
      await expect(page.locator("[data-search-icon]")).toBeVisible();
    });

    test("two bars: equal width, one above the other, ⇅ to their right", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      const from = await boxOf(page, "from");
      const to = await boxOf(page, "to");
      const button = await boxOf(page, "swap");

      expect(to.width).toBeCloseTo(from.width, 0);
      expect(to.x).toBeCloseTo(from.x, 0);
      expect(to.y).toBeGreaterThanOrEqual(from.y + from.height);
      expect(button.x).toBeGreaterThanOrEqual(from.x + from.width);
      const middle = button.y + button.height / 2;
      expect(middle).toBeGreaterThan(from.y);
      expect(middle).toBeLessThan(to.y + to.height);
    });

    test("the rider marks From and the flag marks To, and the rider stands at the start", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      await expect(page.locator('[data-trip-rail="from"] img')).toBeVisible();
      await expect(page.locator('[data-trip-rail="to"] img')).toBeVisible();
      await expect(
        page.getByRole("img", { name: "Starting point" }),
      ).toBeVisible();
    });

    test("Add destination, the destination's star and ★ Saved sit under the boxes", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);
      const to = await boxOf(page, "to");
      const star = await boxOf(page, "saved");
      const add = await addDestination(page).boundingBox();
      const save = await page
        .getByRole("button", { name: /^Save(d:)? .*Happo-One/ })
        .boundingBox();
      if (!add || !save) throw new Error("the row is not laid out");

      expect(add.y).toBeGreaterThanOrEqual(to.y + to.height);
      expect(save.y).toBeGreaterThanOrEqual(to.y + to.height);
      expect(star.y).toBeGreaterThanOrEqual(to.y + to.height);
    });

    test("⊕ Add destination opens the empty stop box", async ({ page }) => {
      await page.goto(TRIP);
      await routeReady(page);

      await addDestination(page).click();

      await expect(
        page.getByRole("combobox", { name: "Stop 1" }),
      ).toBeFocused();
      await expect(page.getByRole("button", { name: "Add stop" })).toHaveCount(
        0,
      );
    });

    test("Add destination works while Saved is open: it closes Saved", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);
      await saved(page).click();
      await expect(saved(page)).toHaveAttribute("aria-pressed", "true");

      await addDestination(page).click();

      await expect(saved(page)).toHaveAttribute("aria-pressed", "false");
      await expect(
        page.getByRole("combobox", { name: "Stop 1" }),
      ).toBeFocused();
    });

    test("Bus has the same two boxes but no Add destination", async ({
      page,
    }) => {
      await page.goto(BUS_TRIP);
      await expect(toBox(page)).toHaveValue(/Happo-One/, { timeout: 15_000 });

      const from = await boxOf(page, "from");
      const to = await boxOf(page, "to");

      expect(to.width).toBeCloseTo(from.width, 0);
      await expect(addDestination(page)).toHaveCount(0);
      await expect(saved(page)).toBeVisible();
    });
  });
}

test.describe("phone 360x740", () => {
  test.use({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  });

  test("the To box is fully in view and still wide enough to read", async ({
    page,
  }) => {
    await page.goto(TRIP);
    await routeReady(page);

    const to = await boxOf(page, "to");

    expect(to.x + to.width).toBeLessThanOrEqual(360);
    expect(to.y + to.height).toBeLessThanOrEqual(740);
    expect(to.width).toBeGreaterThanOrEqual(220);
  });

  test("the expanded sheet stops below the taller card, so its handle can be reached", async ({
    page,
  }) => {
    await page.goto(TRIP);
    await routeReady(page);

    await addDestination(page).click();

    const sheet = page.locator("[data-sheet]");
    await expect(sheet).toHaveAttribute("data-state", "expanded");
    await expect
      .poll(async () => {
        const top = (await sheet.boundingBox())?.y ?? 0;
        const card = await page.locator("[data-trip-header]").boundingBox();
        return top - ((card?.y ?? 0) + (card?.height ?? 0));
      })
      .toBeGreaterThanOrEqual(0);
  });
});

test.describe("mouse clicks on the map (v1.13 rule 8)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** A spot of bare map, by hit test, once the camera has settled. */
  const bareMap = async (page: Page) => {
    let found: { x: number; y: number } | null = null;
    await expect(async () => {
      found = await page.evaluate(() => {
        for (const y of [160, 240, 320, 700, 780])
          for (const x of [1300, 1200, 1100, 1000]) {
            const hit = document.elementFromPoint(x, y);
            if (hit?.classList.contains("maplibregl-canvas")) return { x, y };
          }
        return null;
      });
      expect(found, "bare map").not.toBeNull();
    }).toPass({ timeout: 10_000 });
    return found as unknown as { x: number; y: number };
  };
  const fromParam = (page: Page) =>
    new URL(page.url()).searchParams.get("from");
  // longer than the wait that tells a click from a double-click
  const pastDoubleClick = (page: Page) => page.waitForTimeout(800);

  test("with both ends set, a click changes nothing", async ({ page }) => {
    await page.goto(TRIP);
    await routeReady(page);
    const at = await bareMap(page);
    const before = await fromBox(page).inputValue();

    await page.mouse.click(at.x, at.y);
    await pastDoubleClick(page);

    expect(fromParam(page)).toBe(STATION);
    await expect(fromBox(page)).toHaveValue(before);
  });

  test("with only a start, a click still moves it", async ({ page }) => {
    await page.goto(`/?from=${STATION}&mode=drive`);
    await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
      timeout: 30_000,
    });
    const at = await bareMap(page);

    await page.mouse.click(at.x, at.y);

    await expect.poll(() => fromParam(page)).not.toBe(STATION);
  });
});

// v1.13 rules 1-3: a search gives one bar and a card of next steps; Directions gives two
const placeCard = (page: Page) =>
  page.getByRole("group", { name: "From here" });
const directions = (page: Page) =>
  placeCard(page).getByRole("button", { name: "Directions" });
const START_ONLY = `/?from=${STATION}&mode=drive`;

async function searchStation(page: Page) {
  await fromBox(page).fill("Hakuba Station");
  await page
    .getByRole("option", { name: /Hakuba Station/ })
    .first()
    .click({ timeout: 15_000 });
}

for (const device of DEVICES) {
  test.describe(`${device.name} · place card`, () => {
    test.use(device.use);

    test("a search gives one bar, the card under it, and the rider at the start", async ({
      page,
    }) => {
      await page.goto("/?mode=drive");
      await expect(fromBox(page)).toBeVisible({ timeout: 15_000 });
      await expect(placeCard(page)).toHaveCount(0);

      await searchStation(page);

      await expect(directions(page)).toBeVisible();
      for (const name of ["Ski", "Food", "Konbini"])
        await expect(
          placeCard(page).getByRole("button", { name }),
        ).toBeVisible();
      await expect(
        placeCard(page).getByRole("button", { name: /^Save(d:)? / }),
      ).toBeVisible();
      await expect(toBox(page)).toHaveCount(0);
      await expect(
        page.getByRole("img", { name: "Starting point" }),
      ).toBeVisible();
    });

    test("Food picks the food list and keeps one bar", async ({ page }) => {
      await page.goto(START_ONLY);

      await placeCard(page).getByRole("button", { name: "Food" }).click();

      await expect(page.getByRole("tab", { name: /Food/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        placeCard(page).getByRole("button", { name: "Food" }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(toBox(page)).toHaveCount(0);
    });

    test("Directions makes the place the destination and leaves From empty", async ({
      page,
    }) => {
      await page.goto("/?mode=drive");
      await searchStation(page);

      await directions(page).click();

      await expect(toBox(page)).toHaveValue(/Hakuba Station/);
      await expect(fromBox(page)).toHaveValue("");
      await expect(swap(page)).toBeDisabled();
      await expect(placeCard(page)).toHaveCount(0);
      await expect
        .poll(() => new URL(page.url()).searchParams.get("from"))
        .toBeNull();
    });

    test("✕ on To with a start set goes back to one bar and the card", async ({
      page,
    }) => {
      await page.goto(TRIP);
      await routeReady(page);

      await page.getByRole("button", { name: "Remove destination" }).click();

      await expect(toBox(page)).toHaveCount(0);
      await expect(directions(page)).toBeVisible();
    });

    test("Bus: the card has Directions and Save only", async ({ page }) => {
      await page.goto(`/?from=${STATION}&mode=bus`);

      await expect(directions(page)).toBeVisible({ timeout: 15_000 });
      await expect(
        placeCard(page).getByRole("button", { name: "Food" }),
      ).toHaveCount(0);
      await expect(
        placeCard(page).getByRole("button", { name: "Ski" }),
      ).toHaveCount(0);
      await expect(
        placeCard(page).getByRole("button", { name: "Konbini" }),
      ).toHaveCount(0);
    });

    test("Directions on a resort start selects that resort as the destination", async ({
      page,
    }) => {
      await page.goto("/?mode=drive");
      await fromBox(page).fill("Happo-One");
      await page
        .getByRole("option", { name: /Happo-One/ })
        .first()
        .click({ timeout: 15_000 });

      await directions(page).click();

      await expect(toBox(page)).toHaveValue(/Happo-One/);
      await expect
        .poll(() => new URL(page.url()).searchParams.get("resort"))
        .toBe("happo-one");
    });

    test("Bus: Directions makes the place the destination there too", async ({
      page,
    }) => {
      await page.goto("/?mode=bus");
      await searchStation(page);

      await directions(page).click();

      await expect(toBox(page)).toHaveValue(/Hakuba Station/);
      await expect(fromBox(page)).toHaveValue("");
    });

    test("a linked destination still loading never shows the card", async ({
      page,
    }) => {
      // the resorts answer late: the link already names the destination
      await page.route("**/api/resorts", async (route) => {
        await new Promise((r) => setTimeout(r, 3_000));
        await route.continue();
      });
      await page.goto(TRIP);
      await expect(fromBox(page)).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1_000); // inside the 3 s the answer takes

      // counted once: a retrying assertion would wait for the answer and pass anyway
      expect(await placeCard(page).count()).toBe(0);
      await expect(toBox(page)).toHaveValue(/Happo-One/, { timeout: 15_000 });
    });

    test("Bus: a food row in the link still leaves the card, since Bus has no food list", async ({
      page,
    }) => {
      await page.goto(
        `/?from=${STATION}&mode=bus&cat=food&dest=poi:osm:node/123`,
      );

      await expect(directions(page)).toBeVisible({ timeout: 15_000 });
    });

    test("a resort from the list turns one bar into two, keeping the same From box", async ({
      page,
    }) => {
      await page.goto(START_ONLY);
      await expect(fromBox(page)).toBeVisible({ timeout: 15_000 });
      const box = await fromBox(page).elementHandle();
      if (!box) throw new Error("no From box");

      await page
        .getByRole("list", { name: "Ranked resorts" })
        .getByRole("button", { name: /Happo-One/ })
        .click({ timeout: 15_000 });

      await expect(toBox(page)).toHaveValue(/Happo-One/);
      expect(await box.evaluate((el) => el.isConnected)).toBe(true);
    });
  });
}
