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
