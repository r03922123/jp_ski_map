import { expect, type Page, test } from "@playwright/test";

// SPEC-web-app v1.14: no Rider, Quests or Sound buttons, no sound, no rider card.

const HUD = [/^Rider card/, /^Quests/, /^Sound effects/];

/** Count the AudioContexts the page creates. */
async function countAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __audioContexts: number;
      AudioContext: typeof AudioContext;
    };
    w.__audioContexts = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      constructor(...args: ConstructorParameters<typeof AudioContext>) {
        super(...args);
        w.__audioContexts++;
      }
    };
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __audioContexts: number }).__audioContexts,
    );
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  // the resort list is the sheet's answer: once it shows, the sheet is laid out
  await expect(page.getByRole("list", { name: "Ranked resorts" })).toBeVisible({
    timeout: 15_000,
  });
}

async function expectNoHud(page: Page) {
  for (const name of HUD) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
}

test.describe("phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("the swiped-up sheet has no Rider, Quests or Sound button", async ({
    page,
  }) => {
    await open(page, "/?from=36.69711,137.85393&mode=drive");
    await page.getByRole("button", { name: /expand directions/i }).click();
    await expect(
      page.getByRole("region", { name: "Directions" }),
    ).toHaveAttribute("data-state", "expanded");
    await expectNoHud(page);
  });
});

test.describe("laptop", () => {
  test("the side card has no Rider, Quests or Sound button", async ({
    page,
  }) => {
    await open(page, "/?from=36.69711,137.85393&mode=drive");
    await expectNoHud(page);
  });

  test("taps make no sound, even with sound saved as on", async ({ page }) => {
    const contexts = await countAudio(page);
    // someone who turned sound on before v1.14
    await page.addInitScript(() => localStorage.setItem("hakuba:sound", "on"));
    await open(page, "/?from=36.69711,137.85393&mode=drive");
    await page.getByRole("tab", { name: /Walk/ }).click();
    await page.getByRole("tab", { name: /Drive/ }).click();
    expect(await contexts()).toBe(0);
  });

  test("a #rider= link opens the app with no dialog", async ({ page }) => {
    await open(page, "/?from=36.69711,137.85393&mode=drive#rider=eyJuIjoiQSJ9");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
