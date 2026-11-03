import {
  type Browser,
  type CDPSession,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

// Journey group S, SETTING THE START: "where am I staying / where do I leave from".
// Goals, not screens: every way a skier can set, change, clear, reload and share the start,
// on four devices and under bad conditions. Good behaviour comes from SPEC-web-app (v1.4,
// v1.7), SPEC-place-search, SPEC-saved-places and Google Maps (docs/ux/behaviour-cards.md).
// A test that fails today because of a real bug is wrapped in test.fail() with
// `// known: <id>`, so the suite is green now and flips red when the bug is fixed.
// Finding ids: S* (this journey run), review ids from docs/ux/2026-11-03-ux-review.md.

type Device = {
  name: string;
  touch: boolean;
  use: {
    viewport: { width: number; height: number };
    isMobile?: boolean;
    hasTouch?: boolean;
  };
};

const DEVICES: Device[] = [
  {
    name: "phone 393",
    touch: true,
    use: {
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "small phone 360",
    touch: true,
    use: {
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "laptop 1440",
    touch: false,
    use: { viewport: { width: 1440, height: 900 } },
  },
  {
    name: "laptop 1280",
    touch: false,
    use: { viewport: { width: 1280, height: 720 } },
  },
];
const PHONE = DEVICES[0];
const SMALL = DEVICES[1];
const LAPTOP = DEVICES[2];
const LAPTOP_SMALL = DEVICES[3];

const HOTEL = { name: "Hotel Hakuba", from: /^36\.6971\d*,137\.8539\d*$/ };
const TOKYU = {
  name: "Hakuba Tokyu Hotel",
  from: /^36\.70[56]\d*,137\.839\d*$/,
};

// ---------- helpers ----------

const fromParam = (page: Page) => new URL(page.url()).searchParams.get("from");
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search hotel or place" });
const trip = (page: Page) => page.getByRole("list", { name: "Trip" });
const fromRow = (page: Page) =>
  trip(page).locator("li").filter({ hasText: "From:" });
const toRow = (page: Page) =>
  trip(page).locator("li").filter({ hasText: "To:" });

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
}

/** A tap on touch devices, a click with the mouse. */
async function press(dev: Device, target: Locator) {
  if (dev.touch) await target.tap();
  else await target.click();
}

/** Type in the start box and pick the first suggestion matching `option`. */
async function searchAndPick(
  dev: Device,
  page: Page,
  text: string,
  option: RegExp,
) {
  await searchBox(page).fill(text);
  await press(dev, page.getByRole("option", { name: option }).first());
}

async function collapseSheet(page: Page) {
  const handle = page.getByRole("button", { name: "Collapse directions" });
  if (await handle.isVisible()) await handle.tap();
  await expect(
    page.getByRole("button", { name: "Expand directions" }),
  ).toBeVisible();
}

/** A point on bare map (canvas, no marker/panel, no lodging pin or route under it). */
async function bareMapPoint(page: Page, region: { x: number[]; y: number[] }) {
  let found: { x: number; y: number } | null = null;
  await expect(async () => {
    found = await page.evaluate((r) => {
      const map = (window as unknown as { __hakubaMap?: any }).__hakubaMap;
      for (const y of r.y)
        for (const x of r.x) {
          const hit = document.elementFromPoint(x, y);
          if (!hit?.classList.contains("maplibregl-canvas")) continue;
          if (map) {
            const rect = map.getCanvas().getBoundingClientRect();
            const px = x - rect.left;
            const py = y - rect.top;
            const near = map
              .queryRenderedFeatures([
                [px - 10, py - 10],
                [px + 10, py + 10],
              ])
              .filter((f: { layer: { id: string } }) =>
                /lodging|route|stop|saved/.test(f.layer.id),
              );
            if (near.length) continue;
          }
          return { x, y };
        }
      return null;
    }, region);
    expect(found, "bare map point").not.toBeNull();
  }).toPass({ timeout: 15_000 });
  return found as unknown as { x: number; y: number };
}

async function touch(
  cdp: CDPSession,
  at: { x: number; y: number },
  holdMs: number,
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: Math.round(at.x), y: Math.round(at.y), id: 1 }],
  });
  await new Promise((r) => setTimeout(r, holdMs)); // the gesture itself, not a state wait
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

/** Zoom in over the village so hotel pins load, then find one clear of the sheet/panel. */
async function hotelPin(page: Page, region: { minX: number; maxY: number }) {
  await page.evaluate(() =>
    (window as unknown as { __hakubaMap: any }).__hakubaMap.jumpTo({
      center: [137.853, 36.6985],
      zoom: 15.5,
    }),
  );
  await expect(page.locator("main")).not.toHaveAttribute(
    "data-lodging-pins",
    "0",
    {
      timeout: 20_000,
    },
  );
  let pin: { x: number; y: number; name: string } | null = null;
  await expect(async () => {
    pin = await page.evaluate((r) => {
      const map = (window as unknown as { __hakubaMap: any }).__hakubaMap;
      const rect = map.getCanvas().getBoundingClientRect();
      for (const f of map.queryRenderedFeatures({ layers: ["lodging-pins"] })) {
        const p = map.project(f.geometry.coordinates);
        const x = rect.left + p.x;
        const y = rect.top + p.y;
        if (x < r.minX || y > r.maxY || y < 90 || x > window.innerWidth - 60)
          continue;
        if (
          !document
            .elementFromPoint(x, y)
            ?.classList.contains("maplibregl-canvas")
        )
          continue;
        return { x, y, name: f.properties.name as string };
      }
      return null;
    }, region);
    expect(pin, "a hotel pin on screen").not.toBeNull();
  }).toPass({ timeout: 15_000 });
  return pin as unknown as { x: number; y: number; name: string };
}

const pinCard = (page: Page) =>
  page
    .locator("fieldset")
    .filter({ has: page.getByRole("button", { name: "Start here" }) });

async function freshContext(browser: Browser, dev: Device, baseURL: string) {
  return browser.newContext({
    ...dev.use,
    baseURL,
    ignoreHTTPSErrors: true,
    timezoneId: "Asia/Tokyo",
  });
}

// ---------- per-device journeys ----------

for (const dev of DEVICES) {
  test.describe(`${dev.name}`, () => {
    test.use(dev.use);

    test("set the start by typing a hotel, then change it by typing another", async ({
      page,
    }) => {
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      await expect(fromRow(page)).toContainText(HOTEL.name);
      await expect(searchBox(page)).toHaveValue(HOTEL.name);
      await expect(
        page.getByRole("img", { name: "Starting point" }),
      ).toBeAttached();

      // change: the old start is replaced cleanly, the destination survives
      await searchAndPick(dev, page, "Hakuba Tokyu", /Tokyu/);
      await expect.poll(() => fromParam(page)).toMatch(TOKYU.from);
      await expect(fromRow(page)).toContainText(TOKYU.name);
      await expect(fromRow(page)).toHaveCount(1);
      await expect(searchBox(page)).toHaveValue(TOKYU.name);
      await expect(toRow(page)).toContainText("Happo-One");
      await expect(
        page.getByRole("img", { name: "Starting point" }),
      ).toHaveCount(1);
    });

    test("typed input: gibberish, very long, Japanese, and a pasted Maps link", async ({
      page,
    }) => {
      await open(page, "/?mode=drive");
      const box = searchBox(page);
      await box.fill("xqzzvplk");
      await expect(page.getByRole("listbox")).toContainText(
        dev.touch
          ? "No matches. Paste a Google Maps link or long-press the map."
          : "No matches. Paste a Google Maps link or tap the map.",
      );
      await box.fill("hakuba ".repeat(45));
      await expect(page.getByRole("listbox")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await box.fill("白馬");
      await expect(page.getByRole("option").first()).toContainText("白馬");
      await box.fill("ホテル");
      await expect(
        page.getByRole("option", { name: /ホテル白馬/ }).first(),
      ).toBeVisible();

      await box.fill(
        "https://www.google.com/maps/place/Hotel+Hakuba/@36.6971,137.8539,17z",
      );
      // the link's own row (detail "Other"), not the previous query's rows kept on screen
      await press(
        dev,
        page.getByRole("option", { name: /Hotel Hakuba\s*Other/ }),
      );
      await expect.poll(() => fromParam(page)).toBe("36.69710,137.85390");
      await expect(fromRow(page)).toContainText("Hotel Hakuba");
      await expect(box).toHaveValue("Hotel Hakuba");
    });

    test("clear the start (trip ✕ and box ✕), set a new one: the destination stays", async ({
      page,
    }) => {
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);

      await press(
        dev,
        page.getByRole("button", { name: "Remove starting point" }),
      );
      await expect.poll(() => fromParam(page)).toBeNull();
      expect(new URL(page.url()).searchParams.get("resort")).toBe("happo-one");
      await expect(fromRow(page)).toHaveCount(0);
      await expect(toRow(page)).toContainText("Happo-One");
      await expect(searchBox(page)).toHaveValue("");
      await expect(
        page.getByText(/to set\s+your starting point/),
      ).toBeVisible();

      await searchAndPick(dev, page, "Hakuba Tokyu", /Tokyu/);
      await expect.poll(() => fromParam(page)).toMatch(TOKYU.from);
      await expect(toRow(page)).toContainText("Happo-One");

      await press(
        dev,
        page.getByRole("button", { name: "Clear starting point" }),
      );
      await expect.poll(() => fromParam(page)).toBeNull();
      await expect(toRow(page)).toContainText("Happo-One");
      await expect(searchBox(page)).toHaveValue("");
    });

    test("star a place, then Start from here (Saved) replaces the start", async ({
      page,
    }) => {
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hakuba Tokyu", /Tokyu/);
      await press(
        dev,
        trip(page).getByRole("button", { name: /^Save Hakuba Tokyu/ }),
      );
      await page.getByRole("checkbox", { name: /Starred/ }).check();
      await press(dev, page.getByRole("button", { name: "Done" }));
      await expect
        .poll(() => page.evaluate(() => history.state?.overlay === true))
        .toBe(false);

      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);

      await press(dev, page.getByRole("button", { name: "Saved places" }));
      await press(dev, page.getByRole("button", { name: /Starred/ }));
      await press(
        dev,
        page.getByRole("button", { name: "Start from here" }).first(),
      );
      await expect.poll(() => fromParam(page)).toMatch(TOKYU.from);
      await expect(searchBox(page)).toHaveValue(TOKYU.name);
      await expect(fromRow(page)).toContainText(TOKYU.name);
      await expect(toRow(page)).toContainText("Happo-One");
    });

    test("Back after changing the start returns to the previous start", async ({
      page,
    }) => {
      // known: B — planning uses replaceState, so Back leaves the app (about:blank)
      test.fail();
      await open(page, "/?mode=drive");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      await searchAndPick(dev, page, "Hakuba Tokyu", /Tokyu/);
      await expect.poll(() => fromParam(page)).toMatch(TOKYU.from);
      await page.goBack().catch(() => null);
      await expect(page).toHaveURL(/from=36\.6971/, { timeout: 5_000 });
    });

    test("a shared link opens with the start's name, not 'Dropped pin'", async ({
      page,
      browser,
      baseURL,
    }) => {
      // known: E — the start comes back from the URL as bare coordinates ("Dropped pin")
      test.fail();
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      const link = page.url();
      const other = await freshContext(browser, dev, baseURL as string);
      const friend = await other.newPage();
      await open(friend, link);
      await expect(fromRow(friend)).toBeVisible();
      await expect(fromRow(friend)).toContainText(HOTEL.name, {
        timeout: 5_000,
      });
      await other.close();
    });
  });
}

// ---------- touch only ----------

for (const dev of [PHONE, SMALL]) {
  test.describe(`${dev.name} touch`, () => {
    test.use(dev.use);

    test("tap a hotel pin: its card is named; Start here makes it the start", async ({
      page,
    }) => {
      await open(page, "/?mode=drive&from=36.6985,137.8376");
      const pin = await hotelPin(page, {
        minX: 0,
        maxY: dev.use.viewport.height * 0.55,
      });
      const cdp = await page.context().newCDPSession(page);
      await touch(cdp, pin, 60);
      const card = pinCard(page);
      await expect(card.locator("legend")).toHaveText(pin.name);
      await card.getByRole("button", { name: "Start here" }).tap();
      await expect(card).toHaveCount(0);
      await expect(fromRow(page)).toContainText(pin.name);
      await expect(searchBox(page)).toHaveValue(pin.name);
    });

    test("long-press → Start here: the box stops showing the old hotel's name", async ({
      page,
    }) => {
      // known: S1 — Start here on a dropped pin sets the label to null, so the box keeps
      // "Hotel Hakuba" while the trip says "Dropped pin" (cluster A's box half, on touch)
      test.fail();
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      await collapseSheet(page);
      const cdp = await page.context().newCDPSession(page);
      const at = await bareMapPoint(page, {
        x: [200, 120, 280, 80, 320],
        y: [130, 160, 190, 220, 250, 280],
      });
      // a plain tap first: it must not edit the trip (v1.7)
      await touch(cdp, at, 60);
      await expect(pinCard(page)).toHaveCount(0);
      expect(fromParam(page)).toMatch(HOTEL.from);
      await touch(cdp, at, 700);
      await expect(pinCard(page)).toBeVisible();
      await pinCard(page).getByRole("button", { name: "Start here" }).tap();
      await expect.poll(() => fromParam(page)).not.toMatch(HOTEL.from);
      await expect(fromRow(page)).toContainText("Dropped pin");
      await expect(toRow(page)).toContainText("Happo-One");
      await expect(searchBox(page)).not.toHaveValue(HOTEL.name, {
        timeout: 5_000,
      });
    });

    test("after picking a suggestion, the start is visible above the sheet", async ({
      page,
    }) => {
      // known: F — the sheet stays ~80 % tall over the start and route after a choice
      test.fail();
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      const sheet = page.getByRole("region", { name: "Directions" });
      await expect(async () => {
        const marker = await page
          .getByRole("img", { name: "Starting point" })
          .boundingBox();
        const top = (await sheet.boundingBox())?.y ?? 0;
        expect(marker, "start marker drawn").not.toBeNull();
        expect(marker!.y + marker!.height).toBeLessThan(top);
      }).toPass({ timeout: 6_000 });
    });
  });
}

test.describe(`${PHONE.name} touch: long-press on a hotel pin`, () => {
  test.use(PHONE.use);
  test("a long-press on a hotel pin names the card after the hotel", async ({
    page,
  }) => {
    // known: S4 — startHold always calls onDropPin(coord, null): the card says
    // "Dropped pin" and the start lands on the pressed point, not the hotel
    test.fail();
    await open(page, "/?mode=drive&from=36.6985,137.8376");
    const pin = await hotelPin(page, { minX: 0, maxY: 450 });
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, pin, 700);
    await expect(pinCard(page)).toBeVisible();
    await expect(pinCard(page).locator("legend")).toHaveText(pin.name, {
      timeout: 3_000,
    });
  });
});

test.describe(`${PHONE.name} touch: pin card near the edge`, () => {
  test.use(PHONE.use);
  test("a pin card dropped near the right edge is fully on screen", async ({
    page,
  }) => {
    // known: S6 — the Popup is pinned to anchor="bottom" with no camera ease, so a card
    // near the top (or a hotel pin near the right edge) is cut off, ✕ and Go here included
    test.fail();
    await open(page, "/?mode=drive&from=36.6985,137.8376");
    const cdp = await page.context().newCDPSession(page);
    // the card is ~223 px wide and centred on the finger: x > 282 pushes it off a 393 screen
    const at = await bareMapPoint(page, {
      x: [360, 350, 370, 340],
      y: [300, 320, 280, 340, 260, 360],
    });
    await touch(cdp, at, 700);
    const card = pinCard(page);
    await expect(card).toBeVisible();
    await expect(card).toBeInViewport({ ratio: 1, timeout: 3_000 });
  });
});

// ---------- mouse only ----------

for (const dev of [LAPTOP, LAPTOP_SMALL]) {
  test.describe(`${dev.name} mouse`, () => {
    test.use(dev.use);

    test("a map click that moves the start also updates the search box", async ({
      page,
    }) => {
      // known: A — onPickOrigin never touches the search label: box "Hotel Hakuba",
      // trip "Dropped pin"
      test.fail();
      await open(page, "/?mode=drive&resort=happo-one");
      await searchAndPick(dev, page, "Hotel Hakuba", /Hotel Hakuba/);
      await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
      await expect(
        page.locator("main:not([data-route-points='0'])"),
      ).toBeAttached({
        timeout: 20_000,
      });
      const w = dev.use.viewport.width;
      const at = await bareMapPoint(page, {
        x: [w - 300, w - 200, w - 400, w - 500],
        y: [200, 260, 320, 380, 440, 500],
      });
      await page.mouse.click(at.x, at.y);
      await expect.poll(() => fromParam(page)).not.toMatch(HOTEL.from);
      await expect(fromRow(page)).toContainText("Dropped pin");
      await expect(searchBox(page)).not.toHaveValue(HOTEL.name, {
        timeout: 5_000,
      });
    });

    test("a click on a hotel pin starts from that hotel, named", async ({
      page,
    }) => {
      // known: E — a mouse click on a named hotel pin gives "Dropped pin"
      test.fail();
      await open(page, "/?mode=drive&from=36.6985,137.8376");
      const pin = await hotelPin(page, {
        minX: 460,
        maxY: dev.use.viewport.height - 60,
      });
      await page.mouse.click(pin.x, pin.y);
      await expect.poll(() => fromParam(page)).not.toBe("36.69850,137.83760");
      await expect(fromRow(page)).toContainText(pin.name, { timeout: 5_000 });
    });
  });
}

test.describe(`${LAPTOP.name}: saved place twice`, () => {
  test.use(LAPTOP.use);
  test("Start from here again after a search: the box shows the saved place", async ({
    page,
  }) => {
    // known: S3 — searchLabel only changes on a *different* value, so starting from the
    // same saved place a second time leaves the last typed name in the box
    test.fail();
    await page.addInitScript(() => {
      if (localStorage.getItem("hakuba:saved")) return;
      localStorage.setItem(
        "hakuba:saved",
        JSON.stringify({
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
            {
              id: "osm:node/tokyu",
              name: "Hakuba Tokyu Hotel",
              coord: { lat: 36.70625, lng: 137.83965 },
              kind: "lodging",
              lists: ["starred"],
              savedAt: "2026-11-03T00:00:00Z",
            },
          ],
        }),
      );
    });
    await open(page, "/?mode=drive");
    const startFromSaved = async () => {
      await page.getByRole("button", { name: "Saved places" }).click();
      await page.getByRole("button", { name: /Starred/ }).click();
      await page.getByRole("button", { name: "Start from here" }).click();
      await expect.poll(() => fromParam(page)).toMatch(TOKYU.from);
    };
    await startFromSaved();
    await expect(searchBox(page)).toHaveValue(TOKYU.name);
    await searchAndPick(LAPTOP, page, "Hotel Hakuba", /Hotel Hakuba/);
    await expect.poll(() => fromParam(page)).toMatch(HOTEL.from);
    await startFromSaved();
    await expect(fromRow(page)).toContainText(TOKYU.name);
    await expect(searchBox(page)).toHaveValue(TOKYU.name, { timeout: 5_000 });
  });
});

// ---------- first visit ----------

for (const dev of DEVICES) {
  test.describe(`${dev.name} first visit`, () => {
    test.use({ ...dev.use, storageState: { cookies: [], origins: [] } });
    test("title → Press start → the first useful action is clear", async ({
      page,
    }) => {
      await page.goto("/");
      const title = page.getByRole("dialog", { name: /Hakuba Valley/i });
      await expect(title).toBeVisible({ timeout: 30_000 });
      await press(dev, page.getByRole("button", { name: "Press start" }));
      await expect(title).toHaveCount(0);
      await expect(searchBox(page)).toBeInViewport();
      await expect(
        page.getByText(
          dev.touch
            ? /long-press the map, to set\s+your starting point/
            : /tap the map, to set\s+your starting point/,
        ),
      ).toBeInViewport();
      // touch: no keyboard pops over the map (focus on the sheet); laptop: ready to type
      if (dev.touch) await expect(searchBox(page)).not.toBeFocused();
      else await expect(searchBox(page)).toBeFocused();
    });
  });
}

// ---------- conditions ----------

test.describe(`${PHONE.name}: search API failing`, () => {
  test.use(PHONE.use);

  test("a 500 from search is shown in place, with the fallbacks named", async ({
    page,
  }) => {
    await page.route("**/api/places/suggest**", (r) =>
      r.fulfill({ status: 500, body: "{}" }),
    );
    await open(page, "/");
    await searchBox(page).fill("Hotel Hakuba");
    await expect(
      page.getByRole("alert").filter({ hasText: "Search is unavailable" }),
    ).toBeInViewport();
  });

  test("with search down, a pasted Maps link still sets the start", async ({
    page,
  }) => {
    // known: R5 — the link is parsed by the same failing /suggest endpoint
    test.fail();
    await page.route("**/api/places/suggest**", (r) =>
      r.fulfill({ status: 500, body: "{}" }),
    );
    await open(page, "/");
    await searchBox(page).fill(
      "https://www.google.com/maps/place/Hotel+Hakuba/@36.6971,137.8539,17z",
    );
    await page
      .getByRole("option", { name: /Hotel Hakuba\s*Other/ })
      .tap({ timeout: 5_000 });
    await expect.poll(() => fromParam(page)).toBe("36.69710,137.85390");
  });

  test("long-press still sets the start while search is down", async ({
    page,
  }) => {
    await page.route("**/api/places/suggest**", (r) =>
      r.fulfill({ status: 500, body: "{}" }),
    );
    await open(page, "/");
    const cdp = await page.context().newCDPSession(page);
    const at = await bareMapPoint(page, {
      x: [200, 120, 280, 80, 320],
      y: [130, 160, 190, 220, 250, 280],
    });
    await touch(cdp, at, 700);
    await pinCard(page).getByRole("button", { name: "Start here" }).tap();
    await expect.poll(() => fromParam(page)).not.toBeNull();
    await expect(fromRow(page)).toContainText("Dropped pin");
  });
});

test.describe(`${LAPTOP_SMALL.name}: offline`, () => {
  test.use(LAPTOP_SMALL.use);
  test("typing a hotel while offline says so", async ({ page, context }) => {
    // known: S2 — the suggest query is paused offline (React Query networkMode
    // "online"): no rows, no alert, nothing at all
    test.fail();
    await open(page, "/?mode=drive&resort=happo-one");
    await context.setOffline(true);
    await searchBox(page).fill("Hotel Hakuba");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /offline|unavailable|connection/i }),
    ).toBeVisible({ timeout: 6_000 });
  });
});

test.describe(`${SMALL.name}: slow 3G`, () => {
  test.use(SMALL.use);
  test("suggestions still arrive and set the start", async ({ page }) => {
    await open(page, "/");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    await searchBox(page).fill("Hakuba Highland");
    await page
      .getByRole("option", { name: /Highland/ })
      .first()
      .tap({ timeout: 20_000 });
    await expect
      .poll(() => fromParam(page), { timeout: 20_000 })
      .not.toBeNull();
  });
});

test.describe(`${PHONE.name}: location`, () => {
  test.use({ ...PHONE.use, permissions: [] });
  test("there is a 'use my location' way to set the start", async ({
    page,
  }) => {
    // known: M15 — no control sets the start from the device's location
    test.fail();
    await open(page, "/");
    await expect(
      page.getByRole("button", {
        name: /my location|current location|near me/i,
      }),
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe(`${PHONE.name}: Asia/Taipei time zone`, () => {
  test.use({ ...PHONE.use, timezoneId: "Asia/Taipei" });
  test("setting the start by a Japanese name works the same", async ({
    page,
  }) => {
    await open(page, "/?mode=drive");
    await searchBox(page).fill("ホテル白馬");
    await page
      .getByRole("option", { name: /ホテル白馬/ })
      .first()
      .tap();
    await expect
      .poll(() => fromParam(page))
      .toMatch(/^36\.697\d*,137\.853\d*$/);
    await expect(fromRow(page)).toBeVisible();
  });
});

test.describe(`${LAPTOP.name}: Maps links without coordinates`, () => {
  test.use(LAPTOP.use);

  test("a place link without @lat,lng still finds the named place", async ({
    page,
  }) => {
    // known: S5 — the API returns [] and the UI says "No matches. Paste a Google Maps
    // link…" right after one was pasted; the name in /place/<name>/ is ignored
    test.fail();
    await open(page, "/");
    await searchBox(page).fill(
      "https://www.google.com/maps/place/Hotel+Hakuba/",
    );
    await expect(
      page.getByRole("option", { name: /Hotel Hakuba/ }).first(),
    ).toBeVisible({
      timeout: 5_000,
    });
  });

  test("a short link that can't be read says so, not 'No matches'", async ({
    page,
  }) => {
    // known: R11 — an unreadable short link shows the generic "No matches" hint.
    // The API answer is stubbed ([] is what it returns when the redirect can't be read),
    // so no request leaves for Google.
    test.fail();
    await page.route("**/api/places/suggest**", (r) =>
      r.request().url().includes("goo.gl")
        ? r.fulfill({
            status: 200,
            contentType: "application/json",
            body: "[]",
          })
        : r.continue(),
    );
    await open(page, "/");
    await searchBox(page).fill("https://maps.app.goo.gl/AbCdEf123");
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(list).not.toContainText("No matches", { timeout: 3_000 });
  });
});
