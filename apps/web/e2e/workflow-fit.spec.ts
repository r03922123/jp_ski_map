import { expect, type Page, test } from "@playwright/test";

// docs/ux/google-maps-workflows.md T6 "Desktop and landscape": every workflow at every size,
// with no horizontal overflow and no action clipped at the window's side edges
const SIZES = [
  { name: "small phone", width: 320, height: 568, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "landscape phone", width: 740, height: 360, touch: true },
  { name: "tablet", width: 768, height: 1024, touch: true },
  { name: "laptop", width: 1024, height: 768, touch: false },
  { name: "desktop", width: 1440, height: 900, touch: false },
] as const;

const STATES = [
  { name: "explore", url: "/", route: false },
  {
    name: "walk trip",
    url: "/?from=36.6985,137.8376&mode=walk&resort=happo-one",
    route: true,
  },
  { name: "bus", url: "/?from=36.6985,137.8376&mode=bus", route: false },
] as const;

/** Buttons the user can reach that stick out past the window's left or right edge. */
async function clipped(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll("button, a, [role='tab'], input")]
      .filter((el) => {
        // markers sit on the map and may leave it; a collapsed side card is out on purpose
        if (el.closest(".maplibregl-marker, [data-panel='hidden']"))
          return false;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || cs.visibility === "hidden")
          return false;
        return r.left < -1 || r.right > w + 1;
      })
      .map(
        (el) =>
          el.getAttribute("aria-label") ??
          el.textContent?.trim().slice(0, 30) ??
          el.tagName,
      );
  });
}

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch && size.width < 768,
    });

    for (const state of STATES) {
      test(`${state.name}: no horizontal overflow, nothing clipped, map controls apart`, async ({
        page,
      }) => {
        await page.goto(state.url);
        // a trip is measured with its route drawn (review of #119: "Routing is unavailable"
        // would pass without ever reaching the 84 px landscape bar)
        await page
          .locator(
            state.route
              ? "main[data-map-loaded='true']:not([data-route-points='0'])"
              : "main[data-map-loaded='true']",
          )
          .waitFor({ timeout: 30_000 });
        if (state.route && size.height < 480)
          await page.locator("[data-sheet][data-slim]").waitFor();
        await page.waitForTimeout(800); // the sheet's height and the route fit settle
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        expect(await clipped(page)).toEqual([]);
        // a tap on a map control lands on that control: the credits' ⓘ rose into the zoom
        // buttons on short landscape phones (zoom-out tapped the ⓘ)
        const overlaps = await page.evaluate(() => {
          const sel = [
            ".maplibregl-ctrl-attrib-button",
            ".maplibregl-ctrl-zoom-in",
            ".maplibregl-ctrl-zoom-out",
            ".maplibregl-ctrl-compass",
          ];
          const boxes = sel.flatMap((s) => {
            const el = document.querySelector(s);
            if (!el) return [];
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? [{ s, r }] : [];
          });
          const out: string[] = [];
          for (const a of boxes)
            for (const b of boxes)
              if (
                a.s < b.s &&
                a.r.left < b.r.right &&
                b.r.left < a.r.right &&
                a.r.top < b.r.bottom &&
                b.r.top < a.r.bottom
              )
                out.push(`${a.s} × ${b.s}`);
          return out;
        });
        expect(overlaps).toEqual([]);
      });
    }
  });
}
