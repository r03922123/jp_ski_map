import { expect, type Page, test } from "@playwright/test";

// T77: on small phones the collapsed sheet must still show the ETA and the Start
// button: the trip's answer and its main action. Measured on screen and hit-tested,
// so a control drawn under something else doesn't count.
const WALK = "/?from=36.69400,137.86900&mode=walk&resort=happo-one";
const DRIVE = "/?from=36.6985,137.8376&mode=drive&resort=happo-one";

async function visibleAndOnTop(page: Page, name: RegExp | string) {
  const el =
    typeof name === "string"
      ? page.getByText(name).first()
      : page.getByRole("button", { name });
  await expect(el).toBeVisible({ timeout: 15_000 });
  // measured once the layout settles: the sheet animates its height and the panel
  // re-renders as routes arrive, so a single early reading can catch it mid-change
  await expect(async () => {
    const box = await el.boundingBox();
    if (!box) throw new Error("not laid out");
    const viewport = page.viewportSize();
    expect(box.y + box.height).toBeLessThanOrEqual(viewport?.height ?? 0);
    const onTop = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit !== null && (node === hit || node.contains(hit));
    });
    expect(onTop).toBe(true);
  }).toPass({ timeout: 10_000 });
}

for (const [label, size] of [
  ["360×740", { width: 360, height: 740 }],
  ["Pixel 7", { width: 412, height: 915 }],
] as const) {
  test.describe(label, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    for (const [mode, url] of [
      ["walk", WALK],
      ["drive", DRIVE],
    ]) {
      test(`${mode}: ETA and Start show in the collapsed sheet`, async ({
        page,
      }) => {
        await page.goto(url);
        const sheet = page.getByRole("region", { name: "Directions" });
        await expect(sheet).toHaveAttribute("data-state", "collapsed");
        await expect(page.getByText(/^ETA ~ \d+/)).toBeAttached({
          timeout: 15_000,
        });
        await visibleAndOnTop(page, "ETA ~");
        await visibleAndOnTop(page, /^(Start navigation|Preview route)$/);
      });
    }
  });
}
