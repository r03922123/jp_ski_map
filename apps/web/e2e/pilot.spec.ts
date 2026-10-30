import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// SPEC-pilot: Start → follow GPS along the route → arrive. GPS is Playwright's mock.
const FROM = { latitude: 36.69711, longitude: 137.85393 }; // Hotel Hakuba
const TO = "36.69877,137.86197"; // JR Hakuba Station
const URL = `/?from=${FROM.latitude},${FROM.longitude}&mode=walk&dest=pt:${TO}`;

async function walkRoute(page: Page): Promise<[number, number][]> {
  const res = await page.request.get(
    `http://127.0.0.1:8010/api/routes?mode=walk&from=${FROM.latitude},${FROM.longitude}&to=${TO}`,
  );
  return (await res.json()).primary.geometry.coordinates;
}

const pilot = (page: Page) => page.getByTestId("pilot");

type DevMap = {
  getStyle(): { layers: { id: string }[] };
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
};
/** Where our route layers sit in the drawn style (bottom first). */
const layerOrder = (page: Page) =>
  page.evaluate(() => {
    const map = (window as unknown as { __hakubaMap: DevMap }).__hakubaMap;
    const ours = [
      "ride-line",
      "route-active-line",
      "route-covered-line",
      "ride-stop-dots",
    ];
    return map
      .getStyle()
      .layers.map((l) => l.id)
      .filter((id) => ours.includes(id));
  });
/** Bus stop dots MapLibre actually rendered on screen. */
const renderedStopDots = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __hakubaMap: DevMap }
      ).__hakubaMap.queryRenderedFeatures({
        layers: ["ride-stop-dots"],
      }).length,
  );

// Pilot is for touch-first devices (SPEC-pilot "Devices"): every journey below runs as a
// phone (touch, coarse primary pointer); the laptop case is its own describe at the end.
test.use({ isMobile: true, hasTouch: true });

async function remaining(page: Page): Promise<number> {
  return Number(await pilot(page).getAttribute("data-nav-remaining-m"));
}

test.describe("with location allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("start, follow the walk, see the distance fall, arrive", async ({
    page,
    context,
  }) => {
    test.slow(); // a whole journey: several GPS moves and screens
    const line = await walkRoute(page);
    await page.goto(URL);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });

    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("region", { name: "Next turn" }),
    ).not.toBeEmpty();
    await expect(
      page.getByRole("region", { name: "Trip progress" }),
    ).toContainText("Live traffic unavailable");
    await expect(page.getByRole("region", { name: "Directions" })).toHaveCount(
      0,
    );
    const atStart = await remaining(page);
    expect(atStart).toBeGreaterThan(800);

    const [lng, lat] = line[Math.floor(line.length / 2)];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await expect
      .poll(() => remaining(page), { timeout: 10_000 })
      .toBeLessThan(atStart - 200);
    await expect(page.locator("main")).toHaveAttribute("data-piloting", "true");

    // dragging the map stops following; Re-centre brings it back
    const box = await page.locator("main canvas").boundingBox();
    if (!box) throw new Error("no map canvas");
    // the drag starts on the position puck (the follow camera keeps it central):
    // touches must pass through it to the map
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 + 60,
      { steps: 20 },
    );
    await page.mouse.up();
    await page.getByRole("button", { name: "Re-centre" }).click();
    await expect(page.getByRole("button", { name: "Re-centre" })).toHaveCount(
      0,
    );

    const [endLng, endLat] = line[line.length - 1];
    await context.setGeolocation({ latitude: endLat, longitude: endLng });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "arrived", {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("region", { name: "Trip progress" }),
    ).toContainText("You've arrived");

    await page.getByRole("button", { name: "Exit navigation" }).click();
    await expect(pilot(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Start navigation" }),
    ).toBeVisible();
  });
});

test.describe("voice", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("speaks the turn as you walk up to it, and Mute silences it", async ({
    page,
    context,
  }) => {
    test.slow(); // a whole journey: several GPS moves and screens
    // record what would be spoken instead of using the machine's voice
    await page.addInitScript(() => {
      const spoken: string[] = [];
      Object.assign(window, { __spoken: spoken });
      Object.defineProperty(window, "speechSynthesis", {
        value: {
          speak: (u: { text: string }) => {
            if (u.text) spoken.push(u.text);
          },
          cancel: () => {},
        },
      });
    });
    const spoken = () =>
      page.evaluate(
        () => (window as unknown as { __spoken: string[] }).__spoken,
      );
    const line = await walkRoute(page);
    await page.goto(URL);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });

    // walk point by point until the heads-up is heard (browsers may merge quick
    // position changes, so a fixed number of points could skip the 50 m window)
    const heard = async () =>
      (await spoken()).some((t) => t.startsWith("In 50 metres, "));
    let walked = 0;
    for (const [x, y] of line) {
      await context.setGeolocation({ latitude: y, longitude: x });
      await page.waitForTimeout(120);
      walked += 1;
      if (await heard()) break;
    }
    await expect.poll(heard, { timeout: 10_000 }).toBe(true);

    await page.getByRole("button", { name: "Mute voice" }).click();
    const before = (await spoken()).length;
    for (const [x, y] of line.slice(walked, walked + 20)) {
      await context.setGeolocation({ latitude: y, longitude: x });
      await page.waitForTimeout(80);
    }
    expect((await spoken()).length).toBe(before);
    expect(
      await page.evaluate(() => localStorage.getItem("hakuba:pilot-muted")),
    ).toBe("1");
  });
});

test.describe("rerouting", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("leaving the route asks for a new one from where you are", async ({
    page,
    context,
  }) => {
    test.slow(); // a whole journey: several GPS moves and screens
    const line = await walkRoute(page);
    // a real walking route that heads south instead: its far end is well off the station route
    const res = await page.request.get(
      `http://127.0.0.1:8010/api/routes?mode=walk&from=${FROM.latitude},${FROM.longitude}&to=36.6905,137.8545`,
    );
    const detour: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    // well off the station route; browsers may merge quick position changes into one
    // callback, so keep walking until the navigator gives up on the old route
    const offRoute = detour.slice(-40);

    await page.goto(URL);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    const [lng, lat] = line[6];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });

    for (const [x, y] of offRoute) {
      await context.setGeolocation({ latitude: y, longitude: x });
      await page.waitForTimeout(150);
      if ((await pilot(page).getAttribute("data-reroutes")) === "1") break;
    }
    await expect(pilot(page)).toHaveAttribute("data-reroutes", "1", {
      timeout: 15_000,
    });

    const [x, y] = offRoute[offRoute.length - 1];
    await context.setGeolocation({ latitude: y + 0.00002, longitude: x });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 10_000,
    });
  });
});

test("location denied: a message, and Exit returns to the directions", async ({
  page,
}) => {
  await page.goto(URL);
  await page
    .getByRole("button", { name: "Start navigation" })
    .click({ timeout: 20_000 });
  await expect(pilot(page).getByRole("alert")).toContainText(/location/i, {
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Exit navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Start navigation" }),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: FROM,
  });

  test("banner and progress bar fit a phone and don't overlap", async ({
    page,
  }) => {
    await page.goto(URL);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });
    const top = await page
      .getByRole("region", { name: "Next turn" })
      .boundingBox();
    const bottom = await page
      .getByRole("region", { name: "Trip progress" })
      .boundingBox();
    if (!top || !bottom) throw new Error("pilot panels missing");
    expect(top.y + top.height).toBeLessThan(bottom.y);
    expect(top.x + top.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});

test.describe("bus journey", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("walk to the stop, wait, ride, and get told where to get off", async ({
    page,
    context,
  }) => {
    test.slow(); // a whole journey: several GPS moves and screens
    const options = readFileSync(
      "e2e/fixtures/bus-options-2026-03-20.json",
      "utf8",
    );
    await page.route("**/api/bus/options**", (route) =>
      route.fulfill({ contentType: "application/json", body: options }),
    );
    await page.clock.setFixedTime(new Date("2026-03-20T08:02:00+09:00"));
    await page.goto(`/?from=${FROM.latitude},${FROM.longitude}&mode=bus`);

    const hakuba47 = page.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    await hakuba47.getByRole("button").first().click({ timeout: 15_000 });

    // 0. before Start: every stop of the ride, in order, with times
    const ALL = [
      "Hakuba Happo Bus Terminal",
      "Happo Nakiyama Slope",
      "Echoland (Spicy)",
      "Hakuba 47 Winter Sports Park",
    ];
    const stopNames = (scope: import("@playwright/test").Locator) =>
      scope
        .getByRole("list", { name: "Bus stops" })
        .locator("[data-stop-name]")
        .allTextContents();
    await expect
      .poll(() => stopNames(hakuba47.getByRole("list", { name: "Journey" })))
      .toEqual(ALL);
    await page.getByRole("button", { name: "Start bus journey" }).click();

    // 1. the walk to the stop, with the bus to catch and its stops underneath
    await expect(
      page.getByRole("region", { name: "Trip progress" }),
    ).toContainText(
      "Then Cortina ↔ Hakuba GORYU from Hakuba Happo Bus Terminal at 08:11",
      { timeout: 15_000 },
    );
    expect(
      await stopNames(page.getByRole("region", { name: "Trip progress" })),
    ).toEqual(ALL);
    // and on the map: the bus line with all of its stops, drawn in a fixed order
    await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.locator("main")).toHaveAttribute(
      "data-map-ride-stops",
      "4",
    );
    // layers arrive asynchronously; once all are there the order must be this
    await expect
      .poll(() => layerOrder(page))
      .toEqual([
        "ride-line",
        "route-active-line",
        "route-covered-line",
        "ride-stop-dots",
      ]);
    await expect.poll(() => renderedStopDots(page)).toBeGreaterThan(0);

    // 2. at the stop: wait, with a countdown
    await context.setGeolocation({
      latitude: 36.7015349,
      longitude: 137.8456096,
    });
    const bus = page.getByTestId("bus-pilot");
    await expect(bus).toHaveAttribute("data-bus-phase", "wait", {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("region", { name: "Bus journey" }),
    ).toContainText("Wait at Hakuba Happo Bus Terminal");
    await expect(
      page.getByRole("region", { name: "Bus progress" }),
    ).toContainText("08:11 · in 9 min");
    expect(
      await stopNames(page.getByRole("region", { name: "Bus progress" })),
    ).toEqual(ALL);

    // 3. on board: stops counted down
    await page.getByRole("button", { name: "I'm on the bus" }).click();
    await expect(bus).toHaveAttribute("data-bus-phase", "ride");
    await expect(
      page.getByRole("region", { name: "Bus journey" }),
    ).toContainText("3 stops to go · next Happo Nakiyama Slope");

    // 4. one stop before: get off next
    await context.setGeolocation({
      latitude: 36.6920952,
      longitude: 137.8449603,
    });
    await expect(
      page.getByRole("region", { name: "Bus journey" }),
    ).toContainText("Get off at Hakuba 47 Winter Sports Park — next stop", {
      timeout: 10_000,
    });
    // the whole list stays, earlier stops marked passed, the next one current
    const progress = page.getByRole("region", { name: "Bus progress" });
    expect(await stopNames(progress)).toEqual(ALL);
    await expect(
      progress.locator('li[data-state="passed"]', {
        hasText: "Happo Nakiyama Slope",
      }),
    ).toHaveCount(1);
    await expect(progress.locator('li[aria-current="step"]')).toContainText(
      "Hakuba 47 Winter Sports Park",
    );
    await expect(page.locator("main")).toHaveAttribute(
      "data-map-ride-stops",
      "4",
    );

    // 5. there
    await context.setGeolocation({ latitude: 36.68456, longitude: 137.82773 });
    await expect(bus).toHaveAttribute("data-bus-phase", "arrived", {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("region", { name: "Bus journey" }),
    ).toContainText("You've arrived at Hakuba 47 Winter Sports Park");
  });
});

test.describe("on a laptop (fine pointer)", () => {
  test.use({ isMobile: false, hasTouch: false });

  test("no Start for directions or the bus: routes and ETAs stay", async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(page.getByRole("list", { name: "Steps" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/ETA ~/).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start navigation" }),
    ).toHaveCount(0);

    const options = readFileSync(
      "e2e/fixtures/bus-options-2026-03-20.json",
      "utf8",
    );
    await page.route("**/api/bus/options**", (route) =>
      route.fulfill({ contentType: "application/json", body: options }),
    );
    await page.goto(`/?from=${FROM.latitude},${FROM.longitude}&mode=bus`);
    const hakuba47 = page.getByRole("region", {
      name: "Hakuba47 Mountain Resort",
    });
    await hakuba47.getByRole("button").first().click({ timeout: 15_000 });
    await expect(hakuba47.getByRole("list", { name: "Journey" })).toBeVisible();
    // Start is hidden anyway while the walk to the stop loads: wait for it, or this
    // assertion would pass whether or not the laptop gate works
    await expect(page.locator("main")).not.toHaveAttribute(
      "data-route-points",
      "0",
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("button", { name: "Start bus journey" }),
    ).toHaveCount(0);
  });

  test("dev ?simulate keeps Start, and Start replays the route without GPS", async ({
    page,
  }) => {
    test.slow();
    // no geolocation permission here: real GPS would fail with "Location is off"
    await page.goto(`${URL}&simulate`);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });
    const first = await remaining(page);
    await expect
      .poll(() => remaining(page), { timeout: 15_000 })
      .toBeLessThan(first - 20);
    await expect(pilot(page).getByRole("alert")).toHaveCount(0);
  });
});

test.describe("a running session", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("is never cut off when the pointer changes; Start follows the device", async ({
    page,
    context,
  }) => {
    test.slow();
    const line = await walkRoute(page);
    await page.goto(URL);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });

    // an iPad gets a trackpad keyboard mid-trip: the primary pointer turns fine
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await expect
      .poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches))
      .toBe(false);
    const before = await remaining(page);
    const [lng, lat] = line[Math.floor(line.length / 2)];
    await context.setGeolocation({ latitude: lat, longitude: lng });
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following");
    await expect
      .poll(() => remaining(page), { timeout: 10_000 })
      .toBeLessThan(before - 100);

    // after the trip the laptop-like device gets no Start; touch again brings it back
    await page.getByRole("button", { name: "Exit navigation" }).click();
    await expect(page.getByRole("list", { name: "Steps" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start navigation" }),
    ).toHaveCount(0);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await expect(
      page.getByRole("button", { name: "Start navigation" }),
    ).toBeVisible();
  });
});

test.describe("a long bus ride on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    permissions: ["geolocation"],
    geolocation: FROM,
  });

  test("all 8 stops listed, the current one scrolled into view", async ({
    page,
    context,
  }) => {
    test.slow();
    const data = JSON.parse(
      readFileSync("e2e/fixtures/bus-options-2026-03-20.json", "utf8"),
    );
    const cortina = data.resorts.find(
      (r: { resortId: string }) => r.resortId === "cortina",
    ).options[0];
    await page.route("**/api/bus/options**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      }),
    );
    await page.clock.setFixedTime(new Date("2026-03-20T08:02:00+09:00"));
    await page.goto(`/?from=${FROM.latitude},${FROM.longitude}&mode=bus`);
    const card = page.getByRole("region", {
      name: "Hakuba Cortina Snow Resort",
    });
    await card.getByRole("button").first().click({ timeout: 15_000 });
    await expect(
      card.getByRole("list", { name: "Bus stops" }).locator("li"),
    ).toHaveCount(8);
    await expect(page.locator("main")).not.toHaveAttribute(
      "data-route-points",
      "0",
      {
        timeout: 15_000,
      },
    );
    await page.getByRole("button", { name: "Start bus journey" }).click();

    const board = cortina.rideStops[0].coord;
    await context.setGeolocation({ latitude: board.lat, longitude: board.lng });
    await expect(page.getByTestId("bus-pilot")).toHaveAttribute(
      "data-bus-phase",
      "wait",
      {
        timeout: 10_000,
      },
    );
    const list = page
      .getByRole("region", { name: "Bus progress" })
      .getByRole("list", {
        name: "Bus stops",
      });
    await expect(list.locator("li")).toHaveCount(8);
    await expect(
      list.locator('li[data-state="passed"], li[aria-current]'),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "I'm on the bus" }).click();
    const norikura = cortina.rideStops[5].coord; // at Norikura: Satomi next
    await context.setGeolocation({
      latitude: norikura.lat,
      longitude: norikura.lng,
    });
    const current = list.locator('li[aria-current="step"]');
    await expect(current).toContainText("Satomi", { timeout: 10_000 });
    await expect(list.locator("li")).toHaveCount(8);
    await expect(current).toBeInViewport();
  });
});

// SPEC-pilot "Preview when you're far away"
const FAR = { latitude: 35.68, longitude: 139.76 }; // Tokyo: far from any Hakuba route

test.describe("far from the route, location already allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: FAR });

  test("the button reads Preview and the route plays, with no reroute requests", async ({
    page,
  }) => {
    test.slow();
    const farRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/routes") && r.url().includes("from=35.68"))
        farRequests.push(r.url());
    });
    await page.goto(URL);
    await page
      .getByRole("button", { name: "Preview route" })
      .click({ timeout: 20_000 });
    await expect(pilot(page)).toHaveAttribute("data-preview", "chosen");
    await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
      timeout: 15_000,
    });
    const first = await remaining(page);
    await expect
      .poll(() => remaining(page), { timeout: 15_000 })
      .toBeLessThan(first - 20);
    await expect(page.getByRole("region", { name: "Next turn" })).toContainText(
      "Preview",
    );
    expect(farRequests).toEqual([]);
  });

  test("the bus explains instead of starting", async ({ page }) => {
    const options = readFileSync(
      "e2e/fixtures/bus-options-2026-03-20.json",
      "utf8",
    );
    await page.route("**/api/bus/options**", (route) =>
      route.fulfill({ contentType: "application/json", body: options }),
    );
    await page.goto(`/?from=${FROM.latitude},${FROM.longitude}&mode=bus`);
    const card = page.getByRole("region", { name: "Hakuba47 Mountain Resort" });
    await card.getByRole("button").first().click({ timeout: 15_000 });
    await page
      .getByRole("button", { name: "Start bus journey" })
      .click({ timeout: 15_000 });
    await expect(
      card.getByText("Bus guidance works near the start"),
    ).toBeVisible();
    await expect(page.getByTestId("bus-pilot")).toHaveCount(0);
    await expect(pilot(page)).toHaveCount(0);
  });
});

test("far, with location allowed only after the page loaded: Start, then Preview", async ({
  page,
  context,
}) => {
  test.slow();
  await page.goto(URL);
  const start = page.getByRole("button", { name: "Start navigation" });
  await expect(start).toBeVisible({ timeout: 20_000 }); // position unknown: no prompt
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(FAR);
  await start.click();
  await expect(pilot(page)).toHaveAttribute("data-preview", "switched", {
    timeout: 15_000,
  });
  await expect(
    page.getByText("You're far from this route: previewing it"),
  ).toBeVisible();
  await expect(pilot(page)).toHaveAttribute("data-nav-phase", "following", {
    timeout: 15_000,
  });
  await expect.poll(() => remaining(page)).toBeGreaterThan(0);
  const first = await remaining(page);
  await expect
    .poll(() => remaining(page), { timeout: 15_000 })
    .toBeLessThan(first - 20);
});
