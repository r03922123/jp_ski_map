import {
  type BrowserContext,
  type CDPSession,
  expect,
  type Page,
  type Request,
  test,
} from "@playwright/test";

// Scenario matrix, group N: STOPS ON THE WAY AND NAVIGATING.
// Each test is a user goal ("stop at a konbini on the way", "navigate there") run from an
// entry point, asserting the good behaviour (SPEC-web-app v1.4/v1.7, SPEC-pilot, Google
// Maps conventions in docs/ux/behaviour-cards.md). A test that fails today because of a
// real bug is wrapped in test.fail() with `// known: <id>`, so it flips when fixed.
// IDs: review clusters in docs/ux/2026-11-03-ux-review.md; N* = found by this matrix.

const API = "http://127.0.0.1:8010";
const HOTEL = { lat: 36.69711, lng: 137.85393 }; // Hotel Hakuba
const STATION = { lat: 36.69877, lng: 137.86197 }; // JR Hakuba Station
const LAWSON = { lat: 36.700886, lng: 137.8468474 }; // the konbini nearest the hotel
const TARO = { lat: 36.6910032, lng: 137.8430989 }; // Taro Club (food)
const TOKYO = { latitude: 35.68, longitude: 139.76 };
const ll = (c: { lat: number; lng: number }) => `${c.lat},${c.lng}`;

const DRIVE = `/?from=${ll(HOTEL)}&mode=drive&resort=happo-one`;
const WALK = `/?from=${ll(HOTEL)}&mode=walk&dest=pt:${ll(STATION)}`;
const WALK_VIA_LAWSON = `${WALK}&stops=${ll(LAWSON)}`;

const PHONE = {
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
};
const SMALL_PHONE = {
  viewport: { width: 360, height: 740 },
  isMobile: true,
  hasTouch: true,
};
const LAPTOP_L = {
  viewport: { width: 1440, height: 900 },
  isMobile: false,
  hasTouch: false,
};
const LAPTOP_S = {
  viewport: { width: 1280, height: 720 },
  isMobile: false,
  hasTouch: false,
};

const trip = (page: Page) => page.getByRole("list", { name: "Trip" });
const tripRows = (page: Page) => trip(page).getByRole("listitem");
const steps = (page: Page) => page.getByRole("list", { name: "Steps" });
const pilot = (page: Page) => page.getByTestId("pilot");
const banner = (page: Page) => page.getByRole("region", { name: "Next turn" });
const progress = (page: Page) =>
  page.getByRole("region", { name: "Trip progress" });
const startButton = (page: Page) =>
  page.getByRole("button", { name: "Start navigation" });
const param = (page: Page, key: string) =>
  new URL(page.url()).searchParams.get(key);

async function routed(page: Page) {
  await expect(
    page.locator("main[data-map-loaded='true']:not([data-route-points='0'])"),
  ).toBeAttached({ timeout: 40_000 });
}

/** Every step's text (the list collapses after five). */
async function allSteps(page: Page) {
  const more = page.getByRole("button", { name: /Show all \d+ steps/ });
  if (await more.isVisible()) await more.click();
  return steps(page).innerText();
}

/** The walk the app will plan through these points, from the API itself. */
async function walkLine(
  page: Page,
  points: { lat: number; lng: number }[],
): Promise<[number, number][]> {
  const res = await page.request.post(`${API}/api/route/path`, {
    data: { mode: "walk", points, stopAtPoints: points.length > 2 },
  });
  expect(res.ok()).toBe(true);
  return (await res.json()).geometry.coordinates;
}

async function remaining(page: Page) {
  return Number(await pilot(page).getAttribute("data-nav-remaining-m"));
}

async function startNav(page: Page) {
  await startButton(page).click({ timeout: 30_000 });
  await expect(pilot(page)).toBeVisible();
}

async function following(page: Page) {
  await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
    timeout: 20_000,
  });
}

/** Walk the fixes one by one until `done` holds (browsers may merge quick moves). */
async function walk(
  page: Page,
  context: BrowserContext,
  line: [number, number][],
  done: () => Promise<boolean>,
  pauseMs = 120,
) {
  for (const [lng, lat] of line) {
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await page.waitForTimeout(pauseMs);
    if (await done()) return;
  }
}

/** A real finger (CDP), as in e2e/pin-card.spec.ts. */
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

/** A point on bare map (no marker, label or panel over it), by hit test. */
async function bareMap(page: Page, nearY: number) {
  let found: { x: number; y: number } | null = null;
  await expect(async () => {
    found = await page.evaluate((near) => {
      const w = window.innerWidth;
      for (let dy = 0; dy <= 160; dy += 20)
        for (const fx of [0.5, 0.3, 0.7, 0.2, 0.8]) {
          const x = Math.round(w * fx);
          const y = near + dy;
          const hit = document.elementFromPoint(x, y);
          if (hit?.classList.contains("maplibregl-canvas")) return { x, y };
        }
      return null;
    }, nearY);
    expect(found, `bare map near y=${nearY}`).not.toBeNull();
  }).toPass({ timeout: 10_000 });
  return found as unknown as { x: number; y: number };
}

/** Route requests through stops (POST /api/route/path) and their bodies. */
function recordPathRequests(page: Page) {
  const bodies: { points: { lat: number; lng: number }[] }[] = [];
  page.on("request", (r: Request) => {
    if (r.url().includes("/api/route/path") && r.method() === "POST")
      bodies.push(r.postDataJSON());
  });
  return bodies;
}

const near = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4;

// ---------------------------------------------------------------------------------------
// Goal: "stop at a konbini on the way", phone
// ---------------------------------------------------------------------------------------
test.describe("phone: adding stops", () => {
  test.use(PHONE);

  test("typing 7-Eleven in a stop box: the route goes through it and a reload keeps it", async ({
    page,
  }) => {
    await page.goto(DRIVE);
    await routed(page);
    await page.getByRole("button", { name: "Add stop" }).tap();
    const box = page.getByRole("combobox", { name: "Stop 1" });
    await expect(box).toBeFocused();
    await box.fill("7-Eleven");
    await page
      .getByRole("option", { name: /7-Eleven/ })
      .first()
      .tap({ timeout: 20_000 });
    await expect(tripRows(page)).toHaveCount(3);
    await expect(tripRows(page).nth(1)).toContainText("7-Eleven");
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .toMatch(/Arrive at stop 1/);
    await expect(page).toHaveURL(/stops=36\.\d+%2C137\.\d+/);
    await expect(page.locator('[data-trip-stop="1"]')).toBeVisible();

    await page.reload();
    await routed(page);
    await expect(tripRows(page)).toHaveCount(3);
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .toContain("Arrive at stop 1");
  });

  test("the stop box's hint is true on touch: a real tap on the map fills it, the start stays", async ({
    page,
  }) => {
    // SPEC-web-app v1.7: an open stop box still takes a tap (the user asked for a point)
    await page.goto(DRIVE);
    await routed(page);
    const from = param(page, "from");
    await page.getByRole("button", { name: "Add stop" }).tap();
    await expect(
      page.getByRole("combobox", { name: "Stop 1" }),
    ).toHaveAttribute("placeholder", /tap the map/i);
    const cdp = await page.context().newCDPSession(page);
    // the focused box expands the sheet: only a strip of map stays above it
    await touch(cdp, await bareMap(page, 40), 60);
    await expect(tripRows(page)).toHaveCount(3);
    await expect(page.getByRole("combobox", { name: "Stop 1" })).toHaveCount(0);
    await expect(page).toHaveURL(/stops=36\.\d+%2C137\.\d+/);
    expect(param(page, "from")).toBe(from);
    await expect(page.getByRole("group", { name: "Dropped pin" })).toHaveCount(
      0,
    );
  });

  test("while a stop box waits for a tap, the route stays in view to tap on", async ({
    page,
  }) => {
    test.fail(); // known: F — focusing the stop box expands the sheet to ~80 %: a 160 px strip of river is left, the route isn't on screen, so "tap the map" is a blind tap
    await page.goto(DRIVE);
    await routed(page);
    await page.getByRole("button", { name: "Add stop" }).tap();
    await expect(page.getByRole("combobox", { name: "Stop 1" })).toBeFocused();
    await page.waitForTimeout(1000); // the sheet's expand animation
    const mapShare = await page.evaluate(() => {
      let rows = 0;
      for (let y = 0; y < innerHeight; y += 10) {
        const hit = document.elementFromPoint(innerWidth / 2, y);
        if (hit?.classList.contains("maplibregl-canvas")) rows += 1;
      }
      return (rows * 10) / innerHeight;
    });
    // fitBounds padding assumes the sheet takes 40 % (review F)
    expect(mapShare).toBeGreaterThanOrEqual(0.4);
  });

  test("a stop's name survives a reload or a shared link", async ({ page }) => {
    test.fail(); // known: E — a typed stop ("Lawson") comes back as "Dropped pin" after reload, and then no longer counts for the konbini quest
    await page.goto(DRIVE);
    await routed(page);
    await page.getByRole("button", { name: "Add stop" }).tap();
    await page.getByRole("combobox", { name: "Stop 1" }).fill("Lawson");
    await page
      .getByRole("option", { name: /Lawson/ })
      .first()
      .tap({ timeout: 20_000 });
    await expect(tripRows(page).nth(1)).toContainText("Lawson");
    await page.reload();
    await routed(page);
    await expect(tripRows(page).nth(1)).toContainText("Lawson", {
      timeout: 10_000,
    });
  });

  for (const q of ["konbini", "コンビニ", "FamilyMart"]) {
    test(`typing "${q}" in a stop box offers a konbini`, async ({ page }) => {
      test.fail(); // known: S — the generic word / a missing brand gives no suggestions
      await page.goto(DRIVE);
      await routed(page);
      await page.getByRole("button", { name: "Add stop" }).tap();
      await page.getByRole("combobox", { name: "Stop 1" }).fill(q);
      await expect(
        page.getByRole("option", { name: /7-Eleven|Lawson|FamilyMart/ }),
      ).not.toHaveCount(0, { timeout: 8_000 });
    });
  }

  test("a konbini from the Konbini tab can become a stop on the way to the resort", async ({
    page,
  }) => {
    test.fail(); // known: S — Konbini rows only replace the destination; there is no "Add stop"
    await page.goto(DRIVE);
    await routed(page);
    await page.getByRole("tab", { name: /Konbini/ }).tap();
    const rows = page.getByRole("list", { name: "Nearby places" });
    await expect(rows.getByRole("button").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: /Add .*stop/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("long-press → Add stop: the pin becomes stop 1, the start stays", async ({
    page,
  }) => {
    await page.goto(DRIVE);
    await routed(page);
    const cdp = await page.context().newCDPSession(page);
    const from = param(page, "from");
    await touch(cdp, await bareMap(page, 200), 700);
    const card = page.getByRole("group", { name: "Dropped pin" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Add stop" }).tap();
    await expect(card).toHaveCount(0);
    await expect(tripRows(page)).toHaveCount(3);
    await expect(page).toHaveURL(/stops=36\.\d+%2C137\.\d+/);
    expect(param(page, "from")).toBe(from);
    await expect(page).toHaveURL(/resort=happo-one/);
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .toContain("Arrive at stop 1");
  });

  test("two stops are visited in order; removing stop 1 renumbers the other", async ({
    page,
  }) => {
    await page.goto(`${DRIVE}&stops=${ll(LAWSON)};${ll(TARO)}`);
    await routed(page);
    await expect(tripRows(page)).toHaveCount(4);
    const text = await allSteps(page);
    const one = text.indexOf("Arrive at stop 1");
    const two = text.indexOf("Arrive at stop 2");
    expect(one).toBeGreaterThan(-1);
    expect(two).toBeGreaterThan(one);
    await expect(page.locator('[data-trip-stop="2"]')).toBeVisible();

    await page.getByRole("button", { name: "Remove stop 1" }).tap();
    await expect(tripRows(page)).toHaveCount(3);
    await expect(page.locator('[data-trip-stop="2"]')).toHaveCount(0);
    // the link keeps only the remaining stop (coordinates rounded to 5 places)
    await expect
      .poll(() => param(page, "stops"))
      .toBe(`${TARO.lat.toFixed(5)},${TARO.lng.toFixed(5)}`);
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .not.toContain("Arrive at stop 2");
  });

  test("at five stops, Add stop is gone from the panel and from the pin card", async ({
    page,
  }) => {
    const five = [
      LAWSON,
      TARO,
      { lat: 36.6995, lng: 137.8512 },
      { lat: 36.6955, lng: 137.8465 },
      { lat: 36.6925, lng: 137.8445 },
    ];
    await page.goto(`${DRIVE}&stops=${five.map(ll).join(";")}`);
    await routed(page);
    await expect(tripRows(page)).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Add stop" })).toHaveCount(0);
    expect(await allSteps(page)).toContain("Arrive at stop 5");

    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, await bareMap(page, 200), 700);
    const card = page.getByRole("group", { name: "Dropped pin" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Go here" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Add stop" })).toHaveCount(0);
  });

  test("a sixth stop in a shared link is dropped, not silently routed", async ({
    page,
  }) => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      lat: 36.692 + i * 0.0015,
      lng: 137.845 + i * 0.001,
    }));
    await page.goto(`${DRIVE}&stops=${six.map(ll).join(";")}`);
    await routed(page);
    await expect(tripRows(page)).toHaveCount(7); // From, 5 stops, To
  });

  test("Bus hides the stops; back on Drive they are still there", async ({
    page,
  }) => {
    await page.goto(`${DRIVE}&stops=${ll(LAWSON)}`);
    await routed(page);
    await expect(tripRows(page)).toHaveCount(3);
    await page.getByRole("tab", { name: /Bus/ }).tap();
    await expect(page.getByRole("button", { name: "Add stop" })).toHaveCount(0);
    await page.getByRole("tab", { name: /Drive/ }).tap();
    await routed(page);
    await expect(tripRows(page)).toHaveCount(3);
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .toContain("Arrive at stop 1");
  });
});

// ---------------------------------------------------------------------------------------
// Goal: navigate there through the stop, phone
// ---------------------------------------------------------------------------------------
test.describe("phone: navigating through a stop", () => {
  test.use({
    ...PHONE,
    permissions: ["geolocation"],
    geolocation: { latitude: HOTEL.lat, longitude: HOTEL.lng },
  });

  test("Start from Walk: the banner announces the stop, then you arrive and the konbini quest is done", async ({
    page,
    context,
  }) => {
    test.slow();
    await page.goto(WALK);
    await routed(page);
    // the stop is typed, so it carries its konbini name (what the quest checks)
    await page.getByRole("button", { name: "Add stop" }).tap();
    await page.getByRole("combobox", { name: "Stop 1" }).fill("Lawson");
    await page
      .getByRole("option", { name: /Lawson/ })
      .first()
      .tap({ timeout: 20_000 });
    await expect(page).toHaveURL(/stops=/);
    const [lat, lng] = (param(page, "stops") ?? "").split(",").map(Number);
    await expect
      .poll(() => allSteps(page), { timeout: 20_000 })
      .toContain("Arrive at stop 1");
    const line = await walkLine(page, [HOTEL, { lat, lng }, STATION]);

    await startNav(page);
    await following(page);
    await expect(progress(page)).toContainText("Live traffic unavailable");
    // follow camera owns the map; the stop circle is still drawn
    await expect(page.locator("main")).toHaveAttribute("data-piloting", "true");
    const atStart = await remaining(page);

    const sawStop = async () =>
      /stop 1/i.test((await banner(page).innerText()) ?? "");
    await walk(page, context, line, sawStop);
    await expect(banner(page)).toContainText(/stop 1/i);
    expect(await remaining(page)).toBeLessThan(atStart);

    const ended = async () =>
      (await pilot(page).getAttribute("data-nav-phase")) === "arrived";
    await walk(page, context, line.slice(Math.floor(line.length / 3)), ended);
    const [endLng, endLat] = line[line.length - 1];
    await context.setGeolocation({ latitude: endLat, longitude: endLng });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "arrived", {
      timeout: 15_000,
    });
    await expect(progress(page)).toContainText("You've arrived");

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("hakuba:rider") ?? "{}").quests ??
            [],
        ),
      )
      .toContainEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^konbini\|/),
          status: "done",
        }),
      );

    // Exit returns to the same trip, stop included
    await page.getByRole("button", { name: "Exit navigation" }).tap();
    await expect(pilot(page)).toHaveCount(0);
    await expect(tripRows(page)).toHaveCount(3);
    await expect(startButton(page)).toBeVisible();
  });

  test("a konbini stop from a shared link (or a long-press) also counts for the konbini quest", async ({
    page,
    context,
  }) => {
    test.slow();
    test.fail(); // known: N3 — the quest matches the stop's *name*; a linked or long-pressed stop at a Lawson is "Dropped pin", so arriving doesn't finish "Stop at a konbini on the way"
    const line = await walkLine(page, [HOTEL, LAWSON, STATION]);
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await following(page);
    const ended = async () =>
      (await pilot(page).getAttribute("data-nav-phase")) === "arrived";
    await walk(
      page,
      context,
      line.filter((_, i) => i % 2 === 0),
      ended,
      80,
    );
    const [endLng, endLat] = line[line.length - 1];
    await context.setGeolocation({ latitude: endLat, longitude: endLng });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "arrived", {
      timeout: 15_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("hakuba:rider") ?? "{}").quests ??
              [],
          ),
        { timeout: 5_000 },
      )
      .toContainEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^konbini\|/),
          status: "done",
        }),
      );
  });

  test("Start from Drive with a stop: navigation starts on the route through it", async ({
    page,
  }) => {
    await page.goto(`${DRIVE}&stops=${ll(LAWSON)}`);
    await routed(page);
    await startNav(page);
    await following(page);
    await expect(banner(page)).not.toBeEmpty();
    expect(await remaining(page)).toBeGreaterThan(2000);
    await expect(progress(page)).toContainText("🚗");
  });

  test("drifting off route reroutes from where you are, still through the stop ahead", async ({
    page,
    context,
  }) => {
    test.slow();
    const line = await walkLine(page, [HOTEL, LAWSON, STATION]);
    // a real walk heading south instead: its far end is well off the planned route
    const res = await page.request.get(
      `${API}/api/routes?mode=walk&from=${ll(HOTEL)}&to=36.6905,137.8545`,
    );
    const detour: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    const bodies = recordPathRequests(page);
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    const [lng, lat] = line[4];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await following(page);
    const before = bodies.length;

    const rerouted = async () =>
      (await pilot(page).getAttribute("data-reroutes")) === "1";
    await walk(page, context, detour.slice(-40), rerouted, 150);
    await expect(pilot(page)).toHaveAttribute("data-reroutes", "1", {
      timeout: 20_000,
    });
    const reroute = bodies.slice(before).at(-1);
    expect(
      reroute,
      "the reroute asked for a route through the stop",
    ).toBeTruthy();
    const pts = reroute?.points ?? [];
    expect(pts.length).toBe(3);
    expect(near(pts[1], LAWSON)).toBe(true);
    expect(near(pts[2], STATION)).toBe(true);
    // standing on the new route: guidance resumes
    const [x, y] = detour[detour.length - 1];
    await context.setGeolocation({ latitude: y + 0.00002, longitude: x });
    await following(page);
  });

  test("a tap or a long-press during navigation drops nothing and edits nothing", async ({
    page,
  }) => {
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await following(page);
    const url = page.url();
    const cdp = await page.context().newCDPSession(page);
    const at = await bareMap(page, 300);
    await touch(cdp, at, 60);
    await page.waitForTimeout(800);
    await touch(cdp, at, 800);
    await page.waitForTimeout(500);
    await expect(page.getByRole("group", { name: "Dropped pin" })).toHaveCount(
      0,
    );
    await expect(pilot(page)).toBeVisible();
    expect(page.url()).toBe(url);
    await page.getByRole("button", { name: "Exit navigation" }).tap();
    await expect(tripRows(page)).toHaveCount(3);
    expect(param(page, "from")).toBe(`${HOTEL.lat},${HOTEL.lng}`);
  });

  test("Back during navigation ends navigation and stays on the trip", async ({
    page,
  }) => {
    test.fail(); // known: B — no history entry for navigation: Back leaves the app mid-trip
    await page.goto("/robots.txt");
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await following(page);
    await page.evaluate(() => history.back());
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/robots\.txt$/);
    await expect(pilot(page)).toHaveCount(0);
    await expect(tripRows(page)).toHaveCount(3);
  });

  test("going offline mid-route: navigation keeps going and says it can't reroute", async ({
    page,
    context,
  }) => {
    test.slow();
    const line = await walkLine(page, [HOTEL, LAWSON, STATION]);
    const res = await page.request.get(
      `${API}/api/routes?mode=walk&from=${ll(HOTEL)}&to=36.6905,137.8545`,
    );
    const detour: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    const [lng, lat] = line[4];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await following(page);

    await context.setOffline(true);
    const failed = async () =>
      (await banner(page).innerText()).includes("Can't reroute");
    await walk(page, context, detour.slice(-40), failed, 150);
    await expect(banner(page)).toContainText(
      "Can't reroute — continue to the blue line",
      { timeout: 20_000 },
    );
    await expect(pilot(page)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Exit navigation" }),
    ).toBeEnabled();

    // back on the line (still offline): guidance resumes on the old route
    const [bx, by] = line[8];
    await context.setGeolocation({ latitude: by, longitude: bx });
    await following(page);
    await context.setOffline(false);
  });

  test("the reroute endpoint failing (500): the old route stays, with the note", async ({
    page,
    context,
  }) => {
    test.slow();
    const line = await walkLine(page, [HOTEL, LAWSON, STATION]);
    const res = await page.request.get(
      `${API}/api/routes?mode=walk&from=${ll(HOTEL)}&to=36.6905,137.8545`,
    );
    const detour: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    const [lng, lat] = line[4];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await following(page);
    await page.route("**/api/route/path", (r) =>
      r.fulfill({ status: 500, json: { error: "upstream" } }),
    );
    const failed = async () =>
      (await banner(page).innerText()).includes("Can't reroute");
    await walk(page, context, detour.slice(-40), failed, 150);
    await expect(banner(page)).toContainText("Can't reroute", {
      timeout: 20_000,
    });
    await expect(pilot(page)).toHaveAttribute("data-reroutes", "0");
  });
});

// ---------------------------------------------------------------------------------------
// Location problems during navigation, phone
// ---------------------------------------------------------------------------------------
test.describe("phone: location problems", () => {
  test.use(PHONE);

  test("denied: says how to allow it, Exit keeps the trip with its stop", async ({
    page,
  }) => {
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await expect(pilot(page).getByRole("alert")).toContainText(/location/i, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Exit navigation" }).tap();
    await expect(tripRows(page)).toHaveCount(3);
    await expect(startButton(page)).toBeVisible();
  });

  test("denied: nothing still claims to be waiting for GPS", async ({
    page,
  }) => {
    test.fail(); // known: R7 — the alert says start again while the footer says "Waiting for GPS…" forever
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await expect(pilot(page).getByRole("alert")).toBeVisible({
      timeout: 15_000,
    });
    await expect(progress(page)).not.toContainText("Waiting for GPS");
  });

  test("position unavailable: says so, and Exit keeps the trip", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const err = {
        code: 2,
        message: "unavailable",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };
      Object.defineProperty(navigator, "geolocation", {
        value: {
          watchPosition: (_ok: unknown, fail: (e: unknown) => void) => {
            setTimeout(() => fail(err), 300);
            return 1;
          },
          getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) =>
            setTimeout(() => fail(err), 300),
          clearWatch: () => {},
        },
      });
    });
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await expect(pilot(page).getByRole("alert")).toContainText(
      "Can't find your location",
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Exit navigation" }).tap();
    await expect(tripRows(page)).toHaveCount(3);
  });

  test.describe("±800 m accuracy", () => {
    test.use({
      permissions: ["geolocation"],
      geolocation: { latitude: HOTEL.lat, longitude: HOTEL.lng, accuracy: 800 },
    });

    test("a weak fix shows a Weak GPS chip instead of confident turns", async ({
      page,
    }) => {
      test.fail(); // known: R8 — no "Weak GPS" chip (SPEC-pilot); a ±800 m fix gives turn instructions
      await page.goto(WALK_VIA_LAWSON);
      await routed(page);
      await startNav(page);
      await expect(pilot(page)).not.toHaveAttribute(
        "data-nav-phase",
        "starting",
        {
          timeout: 15_000,
        },
      );
      await expect(pilot(page)).toContainText(/weak gps/i, { timeout: 5_000 });
    });

    test("weak fixes off the line never trigger a reroute", async ({
      page,
      context,
    }) => {
      await page.goto(WALK_VIA_LAWSON);
      await routed(page);
      await startNav(page);
      await expect(pilot(page)).not.toHaveAttribute(
        "data-nav-phase",
        "starting",
        {
          timeout: 15_000,
        },
      );
      for (let i = 0; i < 15; i++) {
        await context.setGeolocation({
          latitude: HOTEL.lat - 0.003 - i * 0.0002,
          longitude: HOTEL.lng,
          accuracy: 800,
        });
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(1000);
      await expect(pilot(page)).toHaveAttribute("data-reroutes", "0");
    });
  });

  test.describe("far away (Tokyo), location already allowed", () => {
    test.use({ permissions: ["geolocation"], geolocation: TOKYO });

    test("with a stop, Start becomes Preview and plays the route through it", async ({
      page,
    }) => {
      test.slow();
      const farRequests: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("35.68") || (r.postData() ?? "").includes("35.68"))
          farRequests.push(r.url());
      });
      await page.goto(WALK_VIA_LAWSON);
      await routed(page);
      await page
        .getByRole("button", { name: "Preview route" })
        .tap({ timeout: 20_000 });
      await expect(pilot(page)).toHaveAttribute("data-preview", "chosen");
      await following(page);
      const first = await remaining(page);
      await expect
        .poll(() => remaining(page), { timeout: 20_000 })
        .toBeLessThan(first - 20);
      expect(farRequests).toEqual([]);
    });

    test("the panel says why it is a Preview before you tap it", async ({
      page,
    }) => {
      test.fail(); // known: R9 — far from Hakuba, Start silently becomes Preview (no reason shown until after the tap)
      await page.goto(WALK_VIA_LAWSON);
      await routed(page);
      await expect(
        page.getByRole("button", { name: "Preview route" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/far from (this|the) route/i)).toBeVisible();
    });
  });
});

// ---------------------------------------------------------------------------------------
// Small phone 360×740 and a non-Japan time zone
// ---------------------------------------------------------------------------------------
test.describe("small phone 360×740", () => {
  test.use({
    ...SMALL_PHONE,
    permissions: ["geolocation"],
    geolocation: { latitude: HOTEL.lat, longitude: HOTEL.lng },
  });

  test("with two stops, Start is on screen; in navigation the banner and bar don't overlap", async ({
    page,
  }) => {
    await page.goto(`${DRIVE}&stops=${ll(LAWSON)};${ll(TARO)}`);
    await routed(page);
    await expect(startButton(page)).toBeInViewport({ timeout: 20_000 });
    await startNav(page);
    await following(page);
    const top = await banner(page).boundingBox();
    const bottom = await progress(page).boundingBox();
    if (!top || !bottom) throw new Error("pilot panels missing");
    expect(top.y + top.height).toBeLessThan(bottom.y);
    expect(top.x + top.width).toBeLessThanOrEqual(360);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

test.describe("phone in another time zone (UTC+8)", () => {
  test.use({
    ...PHONE,
    timezoneId: "Asia/Taipei",
    permissions: ["geolocation"],
    geolocation: { latitude: HOTEL.lat, longitude: HOTEL.lng },
  });

  test("the arrival time in navigation names its zone when it isn't the phone's", async ({
    page,
  }) => {
    test.fail(); // known: C — times are Japan time with no label (BC-A1: Google writes "(GMT+9)")
    await page.goto(WALK_VIA_LAWSON);
    await routed(page);
    await startNav(page);
    await following(page);
    await expect(progress(page)).toContainText(/JST|GMT\+9/);
  });
});

// ---------------------------------------------------------------------------------------
// Laptop: no Start (SPEC-pilot "Devices"); stops with the mouse; a path to the phone
// ---------------------------------------------------------------------------------------
for (const [label, device] of [
  ["laptop 1440×900", LAPTOP_L],
  ["laptop 1280×720", LAPTOP_S],
] as const) {
  test.describe(label, () => {
    test.use(device);

    test("stops by typing work with the mouse; no Start, the ETA and steps stay in view", async ({
      page,
    }) => {
      await page.goto(DRIVE);
      await routed(page);
      await page.getByRole("button", { name: "Add stop" }).click();
      await page.getByRole("combobox", { name: "Stop 1" }).fill("7-Eleven");
      await page
        .getByRole("option", { name: /7-Eleven/ })
        .first()
        .click({ timeout: 20_000 });
      await expect(tripRows(page)).toHaveCount(3);
      await expect
        .poll(() => allSteps(page), { timeout: 20_000 })
        .toContain("Arrive at stop 1");
      await expect(startButton(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Preview route" }),
      ).toHaveCount(0);
      await expect(page.getByText(/^ETA ~ \d+ min/).first()).toBeInViewport();
    });

    test("a reasonable path from the laptop plan to the phone (send or copy the trip link)", async ({
      page,
    }) => {
      test.fail(); // known: N2 — laptop has no Start and nothing replaces it: no "Send to phone"/"Copy link"/QR for the planned trip (Google desktop offers both)
      await page.goto(`${DRIVE}&stops=${ll(LAWSON)}`);
      await routed(page);
      await expect(
        page.getByRole("button", {
          name: /send to (your )?phone|copy link|share (trip|route)/i,
        }),
      ).toBeVisible({ timeout: 5_000 });
    });
  });
}
