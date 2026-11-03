import {
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

/**
 * Journey group D: CHOOSING THE DESTINATION AND SEEING THE ROUTE (scenario matrix,
 * 2026-11-03). Each test asserts the GOOD behaviour (the spec or the Google Maps
 * convention). A test that fails today because of a real bug is wrapped in `test.fail()`
 * with `// known: <id>`; ids are the clusters of docs/ux/2026-11-03-ux-review.md (T, F,
 * L18, J, B, R, C) or this group's D-ids. When the bug is fixed the test flips and
 * Playwright reports it, so the `test.fail()` can be dropped.
 */

// the Mac is often loaded by another project: retry once before calling something broken
// (and touch tests with route fetches can need more than the default 30 s there)
test.describe.configure({ retries: 1, timeout: 60_000 });

const STATION = "36.69877,137.86197"; // JR Hakuba Station: Cortina is ~20 min north
const PLAN = `/?from=${STATION}&mode=drive`;

type Device = {
  name: string;
  touch: boolean;
  use: Parameters<typeof test.use>[0];
};
const PHONE: Device = {
  name: "phone 393x852",
  touch: true,
  use: {
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  },
};
const SMALL: Device = {
  name: "small phone 360x740",
  touch: true,
  use: {
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  },
};
const LAPTOP: Device = {
  name: "laptop 1440x900",
  touch: false,
  use: { viewport: { width: 1440, height: 900 } },
};
const LAPTOP_720: Device = {
  name: "laptop 1280x720",
  touch: false,
  use: { viewport: { width: 1280, height: 720 } },
};
const ALL = [PHONE, SMALL, LAPTOP, LAPTOP_720];
const PHONES = [PHONE, SMALL];
const LAPTOPS = [LAPTOP, LAPTOP_720];

// ---------------------------------------------------------------------------- helpers

/** The primary route's coordinates, from the last routes response the page received. */
const routeCoords = new WeakMap<Page, number[][]>();

function watchRoutes(page: Page) {
  page.on("response", async (r) => {
    if (!/\/api\/routes\?|\/api\/route\/path/.test(r.url()) || !r.ok()) return;
    try {
      const body = await r.json();
      const coords = (body.primary ?? body)?.geometry?.coordinates;
      if (Array.isArray(coords)) routeCoords.set(page, coords);
    } catch {
      // a body that isn't JSON: nothing to record
    }
  });
}

async function open(page: Page, url: string) {
  watchRoutes(page);
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 30_000,
  });
}

async function routeDrawn(page: Page) {
  await expect(
    page.locator("main[data-map-loaded='true']:not([data-route-points='0'])"),
  ).toBeAttached({ timeout: 30_000 });
}

/** Tap on touch devices, click with a mouse. */
async function press(target: Locator, touch: boolean) {
  if (touch) await target.tap();
  else await target.click();
}

const ranked = (page: Page) =>
  page.getByRole("list", { name: "Ranked resorts" });
const fromParam = (page: Page) => new URL(page.url()).searchParams.get("from");
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);

type Box = { x: number; y: number; r: number; b: number };

/**
 * The drawn route's screen box once the camera has settled. On the dev server the map
 * handle projects the whole line; in a production build (no handle) it falls back to
 * what is drawn on top of the line: the start, the destination flag and the ETA pill.
 */
async function routeBox(page: Page): Promise<Box> {
  let last = "";
  let box: Box | null = null;
  await expect(async () => {
    box = await page.evaluate((coords) => {
      const map = (
        window as unknown as {
          __hakubaMap?: {
            isMoving(): boolean;
            project(c: number[]): { x: number; y: number };
          };
        }
      ).__hakubaMap;
      if (map?.isMoving()) return null;
      let pts: { x: number; y: number }[] = [];
      if (map && coords) pts = coords.map((c) => map.project(c));
      else
        for (const sel of [
          '[aria-label="Starting point"], img[alt="Starting point"]',
          'img[alt="Destination"]',
          "[data-route-label='active']",
        ]) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          pts.push({ x: r.left, y: r.top }, { x: r.right, y: r.bottom });
        }
      if (pts.length < 2) return null;
      return {
        x: Math.min(...pts.map((p) => p.x)),
        y: Math.min(...pts.map((p) => p.y)),
        r: Math.max(...pts.map((p) => p.x)),
        b: Math.max(...pts.map((p) => p.y)),
      };
    }, routeCoords.get(page) ?? null);
    expect(box, "the camera has settled on a route").not.toBeNull();
    // two equal readings in a row: the fit animation is over
    const now = JSON.stringify(box);
    const same = now === last;
    last = now;
    expect(same, "route box stable").toBe(true);
  }).toPass({ timeout: 15_000, intervals: [300] });
  return box as unknown as Box;
}

/** The free map area: above the phone sheet, or right of the laptop side panel. */
async function freeArea(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const s = document
      .querySelector("section[data-sheet]")
      ?.getBoundingClientRect();
    if (!s) return { x: 0, y: 0, r: innerWidth, b: innerHeight };
    return innerWidth >= 768
      ? { x: s.right, y: 0, r: innerWidth, b: innerHeight }
      : { x: 0, y: 0, r: innerWidth, b: s.top };
  });
}

async function expectRouteUncovered(page: Page) {
  // the sheet's height transition must be over before its edge is measured
  await expect
    .poll(async () => {
      const a = JSON.stringify(await freeArea(page));
      await page.waitForTimeout(250);
      return a === JSON.stringify(await freeArea(page));
    })
    .toBe(true);
  const route = await routeBox(page);
  const free = await freeArea(page);
  const slack = 2; // sub-pixel rounding
  expect(
    {
      left: route.x >= free.x - slack,
      top: route.y >= free.y - slack,
      right: route.r <= free.r + slack,
      bottom: route.b <= free.b + slack,
    },
    `route ${JSON.stringify(route)} inside free map ${JSON.stringify(free)}`,
  ).toEqual({ left: true, top: true, right: true, bottom: true });
}

async function expandSheet(page: Page) {
  await page.getByRole("button", { name: "Expand directions" }).tap();
  await expect(page.locator("section[data-sheet]")).toHaveAttribute(
    "data-state",
    "expanded",
  );
}

async function chooseResort(page: Page, name: RegExp, touch: boolean) {
  const card = ranked(page).getByRole("button", { name });
  await press(card, touch);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expectTo(page, name);
  await routeDrawn(page);
}

/** A point on bare map (no marker, label or panel over it) near `y`, by hit test. */
async function bareMapPoint(page: Page, y: number) {
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

/** The To box (SPEC-web-app v1.8): drive and walk; bus keeps a read-only To row. */
const toBox = (page: Page) =>
  page.getByRole("combobox", { name: "To", exact: true });
/** The destination is the To box's value (an input's value is not text content). */
async function expectTo(page: Page, name: string | RegExp) {
  const pattern =
    typeof name === "string"
      ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      : name;
  await expect(toBox(page)).toHaveValue(pattern);
}

/** A real finger (CDP), so MapLibre and the browser see touch, not a mouse. */
async function longPress(page: Page, at: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...at, id: 1 }],
  });
  // UIKit's long-press is 0.5 s; the card must appear while the finger is still down
  await expect(page.getByRole("group", { name: "Dropped pin" })).toBeVisible();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

const SAVED_LODGE = {
  id: "d-cortina-lodge",
  name: "Cortina Lodge",
  coord: { lat: 36.7765, lng: 137.8868 },
  kind: "lodging",
};

function seedSaved(page: Page) {
  const builtIn = (id: string, name: string, icon: string) => ({
    id,
    name,
    icon,
    hidden: false,
    builtIn: true,
  });
  const state = {
    version: 1,
    lists: [
      builtIn("starred", "Starred", "star"),
      builtIn("favorites", "Favorites", "heart"),
      builtIn("want-to-go", "Want to go", "flag"),
    ],
    places: [
      { ...SAVED_LODGE, lists: ["favorites"], savedAt: "2026-10-30T00:00:00Z" },
    ],
  };
  return page.addInitScript((value) => {
    localStorage.setItem("hakuba:saved", value);
  }, JSON.stringify(state));
}

async function goHereFromSaved(page: Page, touch: boolean) {
  await press(page.getByRole("button", { name: "Saved places" }), touch);
  await press(page.getByRole("button", { name: /Favorites/ }), touch);
  await press(
    page
      .getByRole("listitem", { name: SAVED_LODGE.name })
      .getByRole("button", { name: "Go here" }),
    touch,
  );
  await expectTo(page, SAVED_LODGE.name);
  await routeDrawn(page);
}

// ----------------------------------------------- 1. "I know where I want to go: let me type it"

for (const d of ALL) {
  test.describe(`type a destination · ${d.name}`, () => {
    test.use(d.use);

    test("once a start is set there is an editable To box (Google: From and To)", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await expect(
        page.getByRole("combobox", {
          name: /^(to|destination|choose destination)/i,
        }),
      ).toBeVisible({ timeout: 3_000 });
    });

    test("with a start and a destination the To box is in view as the page opens (else D1 returns: the user types in the top box)", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await expect(toBox(page)).toBeInViewport({ ratio: 1 });
    });

    test("typing a resort into the To box with a start set makes it the destination, not the start", async ({
      page,
    }) => {
      // fixed: D1 (T) — SPEC-web-app v1.8: the destination is typed in the To box; the
      // From box keeps meaning the start (BC-T1: each field's search changes only itself)
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      const before = fromParam(page);
      const box = toBox(page);
      await box.fill("Cortina");
      const option = page.getByRole("option", {
        name: /Hakuba Cortina Snow Resort/,
      });
      await press(option.first(), d.touch);
      await expect(toBox(page)).toHaveValue(/Hakuba Cortina/, {
        timeout: 5_000,
      });
      // the box's text alone is SearchBox's own echo: check the trip itself changed
      await expect.poll(() => param(page, "resort")).toBe("cortina");
      expect(fromParam(page)).toBe(before);
      await routeDrawn(page);
    });

    test("typing a konbini into the To box makes it the destination with its name, and no resort stays chosen", async ({
      page,
    }) => {
      // code review of v1.8: the non-resort branch (spec rule 1: a free point with its name)
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      const before = fromParam(page);
      await toBox(page).fill("7-Eleven");
      const option = page.getByRole("option", { name: /7-Eleven/ }).first();
      await press(option, d.touch);
      await expect(page).toHaveURL(/dest=pt%3A/);
      await expect(page).not.toHaveURL(/resort=/, { timeout: 3_000 });
      await expectTo(page, /7-Eleven/); // its name, not "Chosen place"
      expect(fromParam(page)).toBe(before);
      await routeDrawn(page);
    });
  });
}

for (const d of [PHONE, LAPTOP]) {
  test.describe(`clear the destination · ${d.name}`, () => {
    test.use(d.use);

    test("✕ on To, then a resort from the list sets a new destination", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=cortina`);
      await routeDrawn(page);
      await press(
        page.getByRole("button", { name: "Remove destination" }),
        d.touch,
      );
      await expect(page).not.toHaveURL(/resort=/);
      await expect(toBox(page)).toHaveValue("");
      await chooseResort(page, /Tsugaike/, d.touch);
      expect(param(page, "resort")).toBe("tsugaike");
    });

    test("✕ on To leaves a box to type the next destination in", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=cortina`);
      await routeDrawn(page);
      await press(
        page.getByRole("button", { name: "Remove destination" }),
        d.touch,
      );
      await expect(
        page.getByRole("combobox", {
          name: /^(to|destination|choose destination)/i,
        }),
      ).toBeVisible({ timeout: 3_000 });
    });
  });
}

// --------------------------------------------------------- 2. the other ways to choose

test.describe("ranked list · laptop 1440x900", () => {
  test.use(LAPTOP.use);

  test("under every sort, the top resort can be chosen and becomes To", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    const sorts = await page
      .locator("#sort-by option")
      .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(sorts.length).toBe(7);
    for (const sort of sorts) {
      if (sort !== "drive_time") {
        const fresh = page.waitForResponse(
          (r) =>
            r.url().includes("/api/rank") && r.url().includes(`sort=${sort}`),
        );
        await page.locator("#sort-by").selectOption(sort);
        await fresh;
      }
      // the re-sorted list renders after its response: read the top card once it is stable
      let name = "";
      await expect(async () => {
        const read = async () =>
          (await ranked(page).getByRole("button").first().innerText())
            .split("\n")[1]
            ?.trim() ?? "";
        const a = await read();
        await page.waitForTimeout(300);
        expect(a, `top resort under ${sort}`).not.toBe("");
        expect(await read()).toBe(a);
        name = a;
      }).toPass({ timeout: 10_000 });
      const top = ranked(page).getByRole("button", { name: new RegExp(name) });
      await top.click();
      await expect(top).toHaveAttribute("aria-pressed", "true");
      await expectTo(page, name);
      await routeDrawn(page);
    }
  });

  test("a resort marker on the map is a way to choose the destination", async ({
    page,
  }) => {
    await open(page, PLAN);
    await page.locator("[data-resort-marker='tsugaike']").click();
    await expect(toBox(page)).toHaveValue(/Tsugaike/);
    await routeDrawn(page);
  });

  test("right-click on the map offers Go here (Google desktop: Directions to here)", async ({
    page,
  }) => {
    test.fail(); // known: L18 — right-click does nothing; with a mouse a map point can't become the destination
    await open(page, `${PLAN}&resort=happo-one`);
    await routeDrawn(page);
    await page.mouse.click(1100, 450, { button: "right" });
    await expect(
      page.getByRole("group", { name: "Dropped pin" }).getByRole("button", {
        name: "Go here",
      }),
    ).toBeVisible({ timeout: 3_000 });
  });
});

for (const d of [PHONE, LAPTOP]) {
  test.describe(`food and konbini · ${d.name}`, () => {
    test.use(d.use);

    for (const cat of ["Food", "Konbini"]) {
      test(`a ${cat} row becomes the destination and its route is drawn`, async ({
        page,
      }) => {
        await open(page, `${PLAN}&resort=happo-one`);
        await routeDrawn(page);
        await press(page.getByRole("tab", { name: new RegExp(cat) }), d.touch);
        const row = page
          .getByRole("list", { name: "Nearby places" })
          .getByRole("button")
          .first();
        await expect(row).toBeVisible({ timeout: 20_000 });
        const name = (await row.innerText()).split("\n")[0].trim();
        await press(row, d.touch);
        await expect(row).toHaveAttribute("aria-pressed", "true");
        await expectTo(page, name);
        await expect(page).toHaveURL(/dest=poi%3A/);
        await routeDrawn(page);
      });
    }
  });
}

test.describe("food and konbini URL · laptop 1440x900", () => {
  test.use(LAPTOP.use);

  test("a konbini destination leaves no stale resort in the shared link", async ({
    page,
  }) => {
    test.fail(); // known: J — the URL keeps resort=happo-one next to dest=poi:
    await open(page, `${PLAN}&resort=happo-one`);
    await routeDrawn(page);
    await page.getByRole("tab", { name: /Konbini/ }).click();
    const row = page
      .getByRole("list", { name: "Nearby places" })
      .getByRole("button")
      .first();
    await row.click();
    await expect(page).toHaveURL(/dest=poi%3A/);
    await expect(page).not.toHaveURL(/resort=/, { timeout: 3_000 });
  });
});

for (const d of PHONES) {
  test.describe(`long-press Go here · ${d.name}`, () => {
    test.use(d.use);

    test("a long-pressed pin's Go here replaces the destination and draws the route above the sheet", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      const before = fromParam(page);
      await longPress(page, await bareMapPoint(page, 120));
      await page
        .getByRole("group", { name: "Dropped pin" })
        .getByRole("button", { name: "Go here" })
        .tap();
      await expect(page).toHaveURL(/dest=pt%3A/);
      await expect(toBox(page)).toHaveValue(/Chosen place/);
      expect(fromParam(page)).toBe(before);
      await routeDrawn(page);
      await expectRouteUncovered(page);
    });

    test("choosing a resort after a pin's Go here replaces the pin", async ({
      page,
    }) => {
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await longPress(page, await bareMapPoint(page, 120));
      await page
        .getByRole("group", { name: "Dropped pin" })
        .getByRole("button", { name: "Go here" })
        .tap();
      await expect(page).toHaveURL(/dest=pt%3A/);
      await chooseResort(page, /Iwatake/, true);
      await expect(page).not.toHaveURL(/dest=pt/);
    });

    test("after a pin's Go here the link holds only the pin, not the old resort", async ({
      page,
    }) => {
      test.fail(); // known: D5 (J) — dest=pt: is added but resort=happo-one stays in the link
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await longPress(page, await bareMapPoint(page, 120));
      await page
        .getByRole("group", { name: "Dropped pin" })
        .getByRole("button", { name: "Go here" })
        .tap();
      await expect(page).toHaveURL(/dest=pt%3A/);
      await expect(page).not.toHaveURL(/resort=/, { timeout: 3_000 });
    });
  });
}

for (const d of [PHONE, LAPTOP]) {
  test.describe(`saved place Go here · ${d.name}`, () => {
    test.use(d.use);

    test("a saved place's Go here becomes To, keeps its name after a reload", async ({
      page,
    }) => {
      await seedSaved(page);
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await goHereFromSaved(page, d.touch);
      await expect(page).toHaveURL(/dest=pt%3A36\.77650%2C137\.88680/);
      await page.reload();
      await routeDrawn(page);
      await expectTo(page, SAVED_LODGE.name);
    });
  });
}

// ------------------------------------------- 3. after choosing: is the WHOLE route visible?

for (const d of PHONES) {
  test.describe(`route visible · ${d.name}`, () => {
    test.use(d.use);

    test("collapsed sheet: a resort chosen from the list is drawn above the sheet", async ({
      page,
    }) => {
      await open(page, PLAN);
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
      await chooseResort(page, /Cortina/, true);
      await expectRouteUncovered(page);
    });

    test("expanded sheet (swiped up to browse): after choosing, the whole route is above the sheet", async ({
      page,
    }) => {
      test.fail(); // known: F — the sheet stays at 80 % and covers the route (user's iPhone report)
      await open(page, PLAN);
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
      await expandSheet(page);
      await chooseResort(page, /Cortina/, true);
      await expectRouteUncovered(page);
    });

    test("saved place Go here: the whole route is above the sheet", async ({
      page,
    }) => {
      test.fail(); // known: F — the Saved panel leaves the sheet expanded over the route
      await seedSaved(page);
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await goHereFromSaved(page, true);
      await expectRouteUncovered(page);
    });
  });
}

for (const d of LAPTOPS) {
  test.describe(`route visible · ${d.name}`, () => {
    test.use(d.use);

    for (const resort of [/Cortina/, /Jigatake/]) {
      test(`the route to ${resort.source} is drawn right of the side panel`, async ({
        page,
      }) => {
        await open(page, PLAN);
        await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
        await chooseResort(page, resort, false);
        await expectRouteUncovered(page);
      });
    }
  });
}

for (const d of ALL) {
  test.describe(`answer in view · ${d.name}`, () => {
    test.use(d.use);

    test("after choosing from further down the list, the ETA and Start are in view", async ({
      page,
    }) => {
      test.fail(); // known: F (L4, M5) — the panel stays scrolled to the card; ETA, Start and the To row are scrolled out above
      await open(page, PLAN);
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
      await chooseResort(page, /Cortina/, d.touch);
      await expect(page.getByText(/^ETA ~/).first()).toBeInViewport({
        ratio: 0.9,
        timeout: 3_000,
      });
    });
  });
}

// ------------------------------- 4. the destination survives mode switches, reload, links, Back

test.describe("destination survives · laptop 1440x900", () => {
  test.use(LAPTOP.use);

  test("Drive → Walk → Bus → Drive keeps the resort", async ({ page }) => {
    await open(page, `${PLAN}&resort=cortina`);
    await routeDrawn(page);
    for (const m of [/Walk/, /Bus/, /Drive/]) {
      await page.getByRole("tab", { name: m }).click();
      await expect(page).toHaveURL(/resort=cortina/);
    }
    await expect(toBox(page)).toHaveValue(/Hakuba Cortina/);
    await routeDrawn(page);
  });

  test("Walk shows the same resort in its picker", async ({ page }) => {
    await open(page, `${PLAN}&resort=cortina`);
    await routeDrawn(page);
    await page.getByRole("tab", { name: /Walk/ }).click();
    await expect(page.locator("#resort-picker")).toHaveValue("cortina");
    await expect(toBox(page)).toHaveValue(/Hakuba Cortina/);
  });

  test("a food destination survives Walk and back to Drive", async ({
    page,
  }) => {
    await open(page, `${PLAN}&resort=happo-one`);
    await routeDrawn(page);
    await page.getByRole("tab", { name: /Food/ }).click();
    const row = page
      .getByRole("list", { name: "Nearby places" })
      .getByRole("button")
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const name = (await row.innerText()).split("\n")[0].trim();
    await row.click();
    await expectTo(page, name);
    await page.getByRole("tab", { name: /Walk/ }).click();
    await expectTo(page, name);
    await page.getByRole("tab", { name: /Drive/ }).click();
    await expectTo(page, name);
    await routeDrawn(page);
  });

  test("reload keeps the destination and draws its route", async ({ page }) => {
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    await chooseResort(page, /Cortina/, false);
    await page.reload();
    await routeDrawn(page);
    await expect(toBox(page)).toHaveValue(/Hakuba Cortina/);
  });

  test("a shared link opens with the same destination in a fresh browser", async ({
    page,
    browser,
  }) => {
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    await chooseResort(page, /Cortina/, false);
    const link = page.url();
    let other: BrowserContext | null = null;
    try {
      // a stranger's browser: no title cookie, no saved places
      other = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
      });
      const p2 = await other.newPage();
      await open(p2, link);
      await routeDrawn(p2);
      await expect(toBox(p2)).toHaveValue(/Hakuba Cortina/);
    } finally {
      await other?.close();
    }
  });

  test("Back after switching the destination returns to the previous one", async ({
    page,
  }) => {
    test.fail(); // known: B — planning adds no history entry; Back leaves the app (about:blank)
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    await chooseResort(page, /Cortina/, false);
    await chooseResort(page, /Tsugaike/, false);
    await page.goBack();
    await expect(page).toHaveURL(/resort=cortina/, { timeout: 3_000 });
  });
});

// ----------------------------------------------------------------- 5. conditions

for (const d of [PHONE, LAPTOP_720]) {
  test.describe(`route API failing · ${d.name}`, () => {
    test.use(d.use);

    test("a failed route after choosing is reported where the user is looking, with Retry", async ({
      page,
    }) => {
      test.fail(); // known: R (+F) — the error sits ~1000 px above the scrolled panel and has no Retry
      await page.route(/\/api\/routes\?/, (r) =>
        r.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
      await open(page, PLAN);
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
      await press(
        ranked(page).getByRole("button", { name: /Cortina/ }),
        d.touch,
      );
      const error = page.getByText(
        /went wrong loading the route|Routing is unavailable/,
      );
      await expect(error).toBeAttached();
      await expect(error).toBeInViewport({ timeout: 3_000 });
      await expect(
        page.getByRole("button", { name: /retry|try again/i }),
      ).toBeVisible();
    });
  });
}

test.describe("slow 3G · phone 393x852", () => {
  test.use(PHONE.use);

  async function slow3g(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 2000,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    });
  }

  test("on slow 3G the chosen destination's route still arrives", async ({
    page,
  }) => {
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    await slow3g(page);
    await chooseResort(page, /Cortina/, true);
  });

  test("on slow 3G, 'Finding route…' is in view while the route loads", async ({
    page,
  }) => {
    test.fail(); // known: R (+F) — the progress text is scrolled out of view; the tap looks ignored
    await open(page, PLAN);
    await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    await slow3g(page);
    await ranked(page)
      .getByRole("button", { name: /Cortina/ })
      .tap();
    await expect(page.getByText("Finding route…")).toBeInViewport({
      timeout: 2_000,
    });
  });
});

for (const d of [PHONE, LAPTOP]) {
  test.describe(`offline after choosing · ${d.name}`, () => {
    test.use(d.use);

    test("switching destination offline says so within 10 s instead of 'Finding route…' forever", async ({
      page,
      context,
    }) => {
      test.fail(); // known: R1 — paused query: "Finding route…" never ends and the old route is wiped
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await context.setOffline(true);
      await press(
        ranked(page).getByRole("button", { name: /Cortina/ }),
        d.touch,
      );
      await expect(
        page
          .getByText(/offline|no connection|internet|couldn.t|try again/i)
          .first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("back online, the route to the destination chosen offline is drawn", async ({
      page,
      context,
    }) => {
      await open(page, `${PLAN}&resort=happo-one`);
      await routeDrawn(page);
      await context.setOffline(true);
      await press(
        ranked(page).getByRole("button", { name: /Cortina/ }),
        d.touch,
      );
      await expect(page.getByText("Finding route…").first()).toBeAttached();
      await context.setOffline(false);
      await routeDrawn(page);
      await expect(toBox(page)).toHaveValue(/Hakuba Cortina/);
    });
  });
}

test.describe("Taipei time zone · laptop 1440x900", () => {
  test.use({ ...LAPTOP.use, timezoneId: "Asia/Taipei" });

  test("the arrival time says which zone it is in (Google: '(GMT+9)')", async ({
    page,
  }) => {
    test.fail(); // known: C — "Arrive ~ 19:29" is Japan time with no label; the device clock reads 18:09
    await open(page, `${PLAN}&resort=cortina`);
    await routeDrawn(page);
    await expect(page.getByText(/Arrive ~/).first()).toContainText(
      /JST|GMT\+9|Japan/,
      { timeout: 3_000 },
    );
  });
});

test.describe("odd input in the only search box · phone 393x852", () => {
  test.use(PHONE.use);

  test("Japanese 白馬コルチナ finds the resort", async ({ page }) => {
    await open(page, `${PLAN}&resort=happo-one`);
    await page.getByRole("combobox", { name: /search/i }).fill("白馬コルチナ");
    await expect(
      page.getByRole("option", { name: /Hakuba Cortina Snow Resort/ }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("gibberish, a 300-character string or an empty Enter change nothing in the trip", async ({
    page,
  }) => {
    await open(page, `${PLAN}&resort=happo-one`);
    await routeDrawn(page);
    const before = page.url();
    const box = page.getByRole("combobox", { name: /search/i });
    await box.fill("zxqvjkwq");
    await expect(page.getByText(/No matches/)).toBeVisible({ timeout: 15_000 });
    await box.fill("ホテル".repeat(100));
    await box.press("Enter");
    await box.fill("");
    await box.press("Enter");
    await expect(toBox(page)).toHaveValue(/Hakuba Happo-One/);
    expect(page.url()).toBe(before);
  });
});
