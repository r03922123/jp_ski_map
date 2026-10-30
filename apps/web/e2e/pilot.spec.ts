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

async function remaining(page: Page): Promise<number> {
  return Number(await pilot(page).getAttribute("data-nav-remaining-m"));
}

test.describe("with location allowed", () => {
  test.use({ permissions: ["geolocation"], geolocation: FROM });

  test("start, follow the walk, see the distance fall, arrive", async ({
    page,
    context,
  }) => {
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
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 + 60,
      { steps: 8 },
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

    for (const [x, y] of line.slice(0, 12)) {
      await context.setGeolocation({ latitude: y, longitude: x });
      await page.waitForTimeout(120);
    }
    await expect
      .poll(spoken, { timeout: 10_000 })
      .toContainEqual(expect.stringMatching(/^In 50 metres, /));

    await page.getByRole("button", { name: "Mute voice" }).click();
    const before = (await spoken()).length;
    for (const [x, y] of line.slice(12, 30)) {
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
    const line = await walkRoute(page);
    // a real walking route that heads south instead: its far end is well off the station route
    const res = await page.request.get(
      `http://127.0.0.1:8010/api/routes?mode=walk&from=${FROM.latitude},${FROM.longitude}&to=36.6905,137.8545`,
    );
    const detour: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    const offRoute = detour.slice(-14);

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
      await page.waitForTimeout(150); // let each fix arrive as its own update
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
    await page.getByRole("button", { name: "Start bus journey" }).click();

    // 1. the walk to the stop, with the bus to catch underneath
    await expect(
      page.getByRole("region", { name: "Trip progress" }),
    ).toContainText(
      "Then Cortina ↔ Hakuba GORYU from Hakuba Happo Bus Terminal at 08:11",
      { timeout: 15_000 },
    );

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
