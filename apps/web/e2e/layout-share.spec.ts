import { expect, type Page, test } from "@playwright/test";

// SPEC-maps-ios-ux: how an iPhone-sized screen splits between top chrome, visible map and
// the sheet, per state. Rows are classified the way the Google Maps frames are: a row is
// map when bare map shows at 2 of 3 points across it. These numbers are a baseline, not a
// target yet; only "the state rendered and some map shows" is asserted.
// LAYOUT_VIEWPORT=390x797 stands in for the home-screen app on a 390×844 iPhone (its 47 pt
// status bar is outside the page)
const [width, height] = (process.env.LAYOUT_VIEWPORT ?? "393x852")
  .split("x")
  .map(Number);
test.use({
  viewport: { width, height },
  isMobile: true,
  hasTouch: true,
});

const STATES = [
  {
    id: "L1",
    note: "opened, no start",
    url: "/",
    wait: "main[data-map-loaded='true']",
  },
  {
    id: "L1b",
    note: "start set, ranked resorts, sheet collapsed",
    url: "/?from=36.6985,137.8376&mode=drive",
    wait: "main[data-map-loaded='true']",
  },
  {
    id: "L4",
    note: "directions preview, sheet collapsed",
    url: "/?from=36.6985,137.8376&mode=drive&resort=happo-one",
    wait: "main[data-map-loaded='true']:not([data-route-points='0'])",
  },
  {
    id: "L4-low",
    note: "directions preview, sheet swiped low (SPEC-web-app v1.17)",
    url: "/?from=36.6985,137.8376&mode=drive&resort=happo-one",
    wait: "main[data-map-loaded='true']:not([data-route-points='0'])",
    low: true,
  },
] as const;

/** A swipe down on the sheet's handle, as a finger would do it (the handle owns its swipe). */
async function swipeSheetDown(page: Page) {
  const handle = page.getByRole("button", { name: "Expand directions" });
  const box = await handle.boundingBox();
  if (!box) throw new Error("no sheet handle");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("[data-sheet]")).toHaveAttribute(
    "data-state",
    "low",
  );
}

/** The element is laid out on screen and a tap at its centre lands on it. */
async function onTop(page: Page, name: RegExp) {
  const el = page
    .getByRole("button", { name })
    .or(page.getByText(name))
    .first();
  await expect(el).toBeVisible();
  const ok = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return (
      r.bottom <= innerHeight &&
      hit !== null &&
      (node === hit || node.contains(hit))
    );
  });
  expect(ok, `${name} visible and on top`).toBe(true);
}

async function share(page: Page) {
  return page.evaluate(() => {
    const w = innerWidth;
    const h = innerHeight;
    const isMap = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return (
        hit !== null &&
        hit.closest(".maplibregl-map") !== null &&
        hit.closest(".maplibregl-ctrl") === null
      );
    };
    const rows: boolean[] = [];
    for (let y = 0; y < h; y++)
      rows.push(
        [w / 4, w / 2, (3 * w) / 4].filter((x) => isMap(x, y + 0.5)).length >=
          2,
      );
    // the floating cards leave thin strips of map at the edges: measure the chrome around
    // the largest unbroken band of map rows
    let best = { start: 0, len: 0 };
    for (let y = 0, start = 0; y <= h; y++) {
      if (y < h && rows[y]) continue;
      if (y - start > best.len) best = { start, len: y - start };
      start = y + 1;
    }
    const pct = (n: number) => Math.round((n / h) * 1000) / 10;
    return {
      topPct: pct(best.start),
      bandPct: pct(best.len),
      mapPct: pct(rows.filter(Boolean).length),
      bottomPct: pct(h - best.start - best.len),
    };
  });
}

for (const s of STATES) {
  test(`${s.id}: ${s.note}`, async ({ page }) => {
    await page.goto(s.url);
    await expect(page.locator(s.wait).first()).toBeAttached({
      timeout: 30_000,
    });
    // the steady state: the phone's credits fold 5 s after load (use-compact-credits)
    await expect(page.locator(".maplibregl-compact-show")).toHaveCount(0, {
      timeout: 15_000,
    });
    if ("low" in s) await swipeSheetDown(page);
    // the sheet animates its height and the camera eases; measure once two readings agree
    await page.waitForTimeout(500); // past the sheet's 200 ms height transition
    let result = await share(page);
    await expect(async () => {
      const again = await share(page);
      const same = JSON.stringify(again) === JSON.stringify(result);
      result = again;
      expect(same).toBe(true);
    }).toPass({ timeout: 10_000, intervals: [500] });

    // the frame the numbers came from, to check a reading by eye
    await page.screenshot({ path: test.info().outputPath(`${s.id}.png`) });
    console.log(
      `layout-share ${JSON.stringify({ state: s.id, width, height, ...result })}`,
    );
    test.info().annotations.push({
      type: "layout-share",
      description: JSON.stringify({ state: s.id, ...result }),
    });
    expect(result.mapPct).toBeGreaterThan(0);
    if ("low" in s) {
      // v1.17 done-when: most of the page is map, and the trip's answer stays in reach
      expect(result.bandPct).toBeGreaterThanOrEqual(60);
      // Next's dev-only "Issues" badge sits bottom-left over the ETA; production has none
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      });
      await onTop(page, /^ETA ~ \d+/);
      await onTop(page, /^(Start navigation|Start|Preview route)$/);
    }
  });
}
