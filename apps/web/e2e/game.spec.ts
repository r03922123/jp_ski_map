import { expect, test } from "@playwright/test";

// SPEC-game-theme v1.6: the overworld's sound and look, in a real browser.

test("sound starts off, needs a tap to start, and the choice survives a reload", async ({
  page,
}) => {
  // count AudioContexts the page creates
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
  const contexts = () =>
    page.evaluate(
      () => (window as unknown as { __audioContexts: number }).__audioContexts,
    );

  await page.goto("/?from=36.69711,137.85393&mode=drive");
  const sound = page.getByRole("button", { name: "Sound effects" });
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("tab", { name: /Walk/ }).click(); // a "select" while muted
  expect(await contexts()).toBe(0);

  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  expect(await contexts()).toBe(1);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sound effects" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await contexts()).toBe(0); // remembered "on", but no audio until a tap
});

test("the map is the overworld: the idle rider stands at the start", async ({
  page,
}) => {
  await page.goto("/?from=36.69711,137.85393&mode=drive");
  await expect(page.locator("main[data-map-loaded='true']")).toBeAttached({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("img", { name: "Starting point" }),
  ).toHaveAttribute("data-pose", "idle");
  // every resort chip carries its world badge
  await expect(page.locator("[data-resort-marker] img").first()).toBeVisible();
});
