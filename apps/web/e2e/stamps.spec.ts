import { expect, type Page, test } from "@playwright/test";

// SPEC-progression v1.6: stamps come only from being at a resort.
const HAPPO_BASE = { latitude: 36.70179, longitude: 137.83683 };
const HOTEL = { latitude: 36.69711, longitude: 137.85393 }; // ~1.6 km away
const DRIVE = "/?from=36.69711,137.85393&mode=drive";

async function checkInAtHappo(page: Page) {
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Hakuba Happo-One" });
  await card.getByText("Details").click();
  await card.getByRole("button", { name: "Check in" }).click();
  return card;
}

test.describe("check in at the base", () => {
  test.use({ permissions: ["geolocation"], geolocation: HAPPO_BASE });

  test("earns the stamp once, then logs today's visit only once", async ({
    page,
  }) => {
    await page.goto(DRIVE);
    await checkInAtHappo(page);
    await expect(page.getByText("Stamp earned!").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("status").filter({ hasText: "World 5" }),
    ).toContainText("Hakuba Happo-One Snow Resort");
    await page.getByRole("button", { name: "OK" }).click();

    // nothing about the position is stored: just the resort and the day
    const stored = await page.evaluate(() =>
      localStorage.getItem("hakuba:rider"),
    );
    expect(stored).toContain('"happo-one"');
    expect(stored).not.toMatch(/36\.\d{3}|137\.\d{3}/);

    await page.reload();
    const again = await checkInAtHappo(page);
    await expect(again.getByText("Already checked in today")).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("check in from the hotel", () => {
  test.use({ permissions: ["geolocation"], geolocation: HOTEL });

  test("too far: says how far, and stamps nothing", async ({ page }) => {
    await page.goto(DRIVE);
    const card = await checkInAtHappo(page);
    await expect(
      card.getByText(/You're 1\.\d km from Hakuba Happo-One/),
    ).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await page.evaluate(() => localStorage.getItem("hakuba:rider")),
    ).toBeNull();
  });
});

test.describe("a trip that ends at the base", () => {
  test.use({
    isMobile: true,
    hasTouch: true,
    permissions: ["geolocation"],
    geolocation: { latitude: 36.70052, longitude: 137.84132 }, // ~400 m east of the base
  });

  test("navigating there and arriving earns the stamp", async ({
    page,
    context,
  }) => {
    await page.goto("/?from=36.70052,137.84132&mode=walk&resort=happo-one");
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 20_000 });
    await expect(page.locator("[data-nav-phase]")).toHaveAttribute(
      "data-nav-phase",
      "following",
      {
        timeout: 15_000,
      },
    );
    // arrive where the route really ends (the app routes to this base)
    const res = await page.request.get(
      "http://127.0.0.1:8010/api/routes?mode=walk&from=36.70052,137.84132&to=36.70179,137.83683",
    );
    const line: [number, number][] = (await res.json()).primary.geometry
      .coordinates;
    // walk it: halfway, then the end (the navigator follows progress along the route)
    for (const [lng, lat] of [
      line[Math.floor(line.length / 2)],
      line[line.length - 1],
    ]) {
      await context.setGeolocation({ latitude: lat, longitude: lng });
      await page.waitForTimeout(1500);
    }
    await expect(page.locator("[data-nav-phase]")).toHaveAttribute(
      "data-nav-phase",
      "arrived",
      {
        timeout: 15_000,
      },
    );
    await expect(page.getByText("Stamp earned!").first()).toBeVisible();
  });
});
