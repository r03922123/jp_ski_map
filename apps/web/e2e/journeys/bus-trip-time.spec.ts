import {
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { devOnly } from "../dev-only";

/**
 * Scenario matrix, group B: BUS AND TRIP TIME ("which bus gets me there, leaving when?").
 *
 * Each test asserts the GOOD behaviour (SPEC-bus-schedules, SPEC-web-app, Google Maps
 * conventions in docs/ux/behaviour-cards.md). A test that fails today because of a real
 * bug is wrapped in `test.fail()` with a `// known: <id>` comment, so the suite is green
 * now and turns red (= "remove the marker") once the bug is fixed. Ids: review clusters
 * from docs/ux/2026-11-03-ux-review.md (C, F, G, H, M4, R…), new findings are B1, B2….
 *
 * Live timetables start 2026-12-13. In-season behaviour uses 2027-01-15 ("Expected",
 * projected from 2025-26); off-season uses a frozen 2026-11-03. Time is controlled with
 * Playwright's clock, never waited out.
 */

// A dropped pin ~800 m from the Happo bus terminal: a walk, then a ride (Line V).
const FROM = "36.6985,137.8376";
const BUS = `/?from=${FROM}&mode=bus`;
const DRIVE = `/?from=${FROM}&mode=drive&resort=happo-one`;
const TOMORROW_8 = "2027-01-15T08:00";
// "today" for the in-season journeys: the evening before
const EVE = new Date("2027-01-14T20:00:00+09:00");
// off-season "today"
const OFF_SEASON = new Date("2026-11-03T10:00:00+09:00");
const TSUGAIKE = "Tsugaike Mountain Resort";

const DEVICES: Record<string, BrowserContextOptions> = {
  phone: {
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  },
  "small phone": {
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
  },
  "laptop 1440": { viewport: { width: 1440, height: 900 } },
  "laptop 1280": { viewport: { width: 1280, height: 720 } },
};
const touch = (d: string) => d === "phone" || d === "small phone";

const leaveAfter = (page: Page) => page.getByLabel("Leave after");
const journey = (page: Page) => page.getByRole("list", { name: "Journey" });
const resort = (page: Page, name: string) => page.getByRole("region", { name });

async function openBus(page: Page, when: Date) {
  await page.clock.install({ time: when });
  await page.goto(BUS);
  await expect(leaveAfter(page)).not.toHaveValue("", { timeout: 20_000 });
}

/** Set "Leave after" and wait for the in-season options. */
async function busAt(page: Page, value: string) {
  await leaveAfter(page).fill(value);
  await expect(
    resort(page, TSUGAIKE)
      .getByText(/\d\d:\d\d → \d\d:\d\d/)
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Pick the earliest option to Tsugaike and wait for its journey on the map. */
async function chooseTsugaike(page: Page) {
  await resort(page, TSUGAIKE).getByRole("button").first().click();
  await expect(journey(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("main")).toHaveAttribute(
    "data-route-layers",
    "walk,ride",
    { timeout: 20_000 },
  );
}

/** Fully inside the viewport and not covered by anything else. */
const inView = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight + 1 || r.height === 0)
        return false;
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit !== null && (el === hit || el.contains(hit));
    });

/** On screen and not under the panel or sheet (map markers and pills may overlap it). */
const onMapArea = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight + 1 || r.height === 0)
        return false;
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      return hit?.closest(".maplibregl-map") != null;
    });

const minutesOf = (text: string) => {
  const h = /(\d+)\s*h/.exec(text);
  const m = /(\d+)\s*min/.exec(text);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
};

type DevMap = {
  queryRenderedFeatures(o: { layers: string[] }): unknown[];
};
const renderedCount = (page: Page, layer: string) =>
  page.evaluate(
    (id) =>
      (
        window as unknown as { __hakubaMap?: DevMap }
      ).__hakubaMap?.queryRenderedFeatures({ layers: [id] }).length ?? -1,
    layer,
  );

// ---------------------------------------------------------------------------------
// Goals that run on all four devices
// ---------------------------------------------------------------------------------
for (const [device, options] of Object.entries(DEVICES)) {
  test.describe(`${device}`, () => {
    test.use(options);

    test("fastest bus tomorrow 08:00: options by arrival, journey timeline, ride stops on the map", async ({
      page,
    }) => {
      devOnly("counts the ride's stop dots through the dev map handle");
      await openBus(page, EVE);
      // the default is "now" in Japan time
      await expect(leaveAfter(page)).toHaveValue("2027-01-14T20:00");
      await busAt(page, TOMORROW_8);
      await expect(page.getByText("Expected", { exact: true })).toBeVisible();

      // within a resort the options are ordered by arrival (fastest first)
      const arrivals = (
        await resort(page, TSUGAIKE)
          .getByText(/\d\d:\d\d → \d\d:\d\d/)
          .allInnerTexts()
      ).map((t) => /→ (\d\d:\d\d)/.exec(t)?.[1] ?? "");
      expect(arrivals.length).toBeGreaterThan(0);
      expect([...arrivals].sort()).toEqual(arrivals);

      await chooseTsugaike(page);
      await expect(journey(page)).toContainText(/Walk \d+ min to /);
      await expect(journey(page)).toContainText("Board 08:10");
      await expect(journey(page)).toContainText("Arrive 08:33");
      await expect(
        journey(page).getByRole("list", { name: "Bus stops" }),
      ).toContainText("Tsugaike");
      await expect(page.getByRole("img", { name: "Bus stop" })).toBeAttached();
      await expect
        .poll(() => renderedCount(page, "ride-stop-dots"), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(2);
    });

    test("after choosing an option the journey (and Start on touch) is in view", async ({
      page,
    }) => {
      // fixed: F (v1.9) — the trip fields moved to the top card and the HUD out of the
      // resting sheet, so the journey and Start fit (was: 1440×900 scrolled below the
      // panel; 360×740 Start below the fold)
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await page.waitForTimeout(800); // the sheet / panel settles after the choice
      expect(await inView(page, "ol[aria-label='Journey']")).toBe(true);
      if (touch(device))
        expect(
          await inView(page, "button[aria-label='Start bus journey']"),
        ).toBe(true);
    });

    test("choosing from a swiped-up sheet still shows the board stop (the sheet comes back down)", async ({
      page,
    }) => {
      // code review of v1.9: the bus choice is part of the sheet's collapse key
      test.skip(!touch(device), "phones: the laptop panel doesn't swipe");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await page.getByRole("button", { name: "Expand directions" }).tap();
      await expect(
        page.getByRole("region", { name: "Directions" }),
      ).toHaveAttribute("data-state", "expanded");
      await chooseTsugaike(page);
      await expect(
        page.getByRole("region", { name: "Directions" }),
      ).toHaveAttribute("data-state", "collapsed");
      await page.waitForTimeout(2000); // fitBounds animation
      await expect
        .poll(() => onMapArea(page, "img[alt='Bus stop']"), { timeout: 5_000 })
        .toBe(true);
    });

    test("the board stop is not hidden under the panel or sheet after choosing", async ({
      page,
    }) => {
      // fixed: F (v1.9) — the sheet rests at its peek and the map's fit leaves room for the
      // top card (was: phones, the sheet stayed ~80 % tall over the walk leg and board stop)
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await page.waitForTimeout(2000); // fitBounds animation
      await expect
        .poll(() => onMapArea(page, "img[alt='Bus stop']"), { timeout: 5_000 })
        .toBe(true);
    });

    test("the bus headline is the door-to-door trip, not the walk to the stop", async ({
      page,
    }) => {
      // known: G — the big "ETA ~ 10 min · 812 m" is only the walk; the trip is 08:00 → 08:33
      test.fail(true, "known: G");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      const headline = page.getByText(/^ETA ~/).first();
      await expect(headline).toBeVisible();
      // Google: the transit headline is door to door (BC-A1, "23 min" with the walk inside)
      expect(minutesOf(await headline.innerText())).toBeGreaterThanOrEqual(30);
    });

    test("one trip time: the bus time is the Drive date, and both are in the URL", async ({
      page,
    }) => {
      // known: C — Drive's Date stays empty after setting the bus to Jan 15; the URL has no time
      test.fail(true, "known: C");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await expect
        .poll(() => page.url(), { timeout: 5_000 })
        .toContain("2027-01-15");
      await page.getByRole("tab", { name: /Drive/ }).click();
      await expect(page.getByLabel("Date")).toHaveValue("2027-01-15");
    });

    test("a reload (or shared link) keeps the bus time and the chosen option", async ({
      page,
    }) => {
      // known: C — after reload "Leave after" is back to now and the panel says "No shuttle service"
      test.fail(true, "known: C");
      await openBus(page, OFF_SEASON);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await page.reload();
      await expect(leaveAfter(page)).toHaveValue(TOMORROW_8, {
        timeout: 15_000,
      });
      await expect(journey(page)).toContainText("Arrive 08:33", {
        timeout: 20_000,
      });
    });

    test('"Arrive ~" moves on while the screen stays open (5 min later)', async ({
      page,
    }) => {
      // known: C2 — "Arrive ~" is computed from the page-load time and never updates
      test.fail(true, "known: C2");
      await page.clock.install({ time: new Date("2027-01-15T07:50:00+09:00") });
      await page.goto(DRIVE);
      const arrive = page.getByText(/Arrive ~ \d\d:\d\d/).first();
      await expect(arrive).toBeVisible({ timeout: 30_000 });
      // the route has settled (a later primary/alternate swap is not "time moving on")
      await page.waitForTimeout(1500);
      const before = await arrive.innerText();
      const [h, m] = (/(\d\d):(\d\d)/.exec(before) ?? []).slice(1).map(Number);
      const later = (h * 60 + m + 5) % (24 * 60);
      const expected = `Arrive ~ ${String(Math.floor(later / 60)).padStart(2, "0")}:${String(later % 60).padStart(2, "0")}`;
      await page.clock.fastForward("05:00");
      await expect
        .poll(() => arrive.innerText(), { timeout: 5_000 })
        .toBe(expected);
    });
  });
}

// ---------------------------------------------------------------------------------
// Time zones: Japan times in a browser elsewhere
// ---------------------------------------------------------------------------------
for (const timezoneId of ["Asia/Taipei", "America/Los_Angeles"]) {
  for (const device of ["phone", "laptop 1440"]) {
    test.describe(`${device}, ${timezoneId}`, () => {
      test.use({ ...DEVICES[device], timezoneId });

      test("'today' and 'now' are Japan time", async ({ page }) => {
        // 00:30 on Nov 4 in Japan = Nov 3 in Taipei (23:30) and Los Angeles (07:30)
        await openBus(page, new Date("2026-11-04T00:30:00+09:00"));
        await expect(leaveAfter(page)).toHaveValue("2026-11-04T00:30");
        await expect(leaveAfter(page)).toHaveAttribute(
          "min",
          "2026-11-04T00:00",
        );
      });

      test("Japan times carry the zone, like Google's '(GMT+9)'", async ({
        page,
      }) => {
        // known: C — times are Japan time with no label; a UTC+8 browser reads them an hour "off"
        test.fail(true, "known: C");
        await openBus(page, EVE);
        await busAt(page, TOMORROW_8);
        await expect(
          page.getByText(/\b(JST|GMT\+9|UTC\+9|Japan time)\b/).first(),
        ).toBeVisible({ timeout: 5_000 });
      });
    });
  }
}

// ---------------------------------------------------------------------------------
// Off-season, night bus, Start for a future trip
// ---------------------------------------------------------------------------------
for (const device of ["phone", "laptop 1440"]) {
  test.describe(`${device}, off-season`, () => {
    test.use(DEVICES[device]);

    test("today says there is no service and when it starts", async ({
      page,
    }) => {
      await openBus(page, OFF_SEASON);
      await expect(
        page.getByText("No shuttle service on this date — next from Dec 13.", {
          exact: false,
        }),
      ).toBeVisible({ timeout: 30_000 });
      // no years in the bus panel (SPEC-bus-schedules v1.1)
      await expect(page.getByText(/No shuttle service/)).not.toContainText(
        /20\d\d/,
      );
    });

    test("one tap jumps to the next service date", async ({ page }) => {
      // known: M3 — "next from Dec 13" is plain text; nothing sets the date to Dec 13
      test.fail(true, "known: M3");
      await openBus(page, OFF_SEASON);
      await expect(page.getByText(/next from Dec 13/)).toBeVisible({
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: /Dec 13/ })
        .or(page.getByRole("link", { name: /Dec 13/ }))
        .first()
        .click({ timeout: 3_000 });
      await expect(leaveAfter(page)).toHaveValue(/^2026-12-13T/);
    });

    test("night bus off-season says there is no service on this date, not 'none nearby'", async ({
      page,
    }) => {
      // known: B1 — the night panel says "No night bus from nearby stops at this time."
      test.fail(true, "known: B1");
      await openBus(page, OFF_SEASON);
      await page.getByLabel("Night bus").check();
      await expect(
        page.getByText(/no (night bus|shuttle) service on this date/i),
      ).toBeVisible({ timeout: 20_000 });
    });

    test("night bus in season lists departures with a direction", async ({
      page,
    }) => {
      await openBus(page, EVE);
      await page.getByLabel("Night bus").check();
      await leaveAfter(page).fill("2027-01-15T18:00");
      await expect(page.getByText(/ towards /).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText("Expected", { exact: true })).toBeVisible();
    });
  });
}

test.describe("laptop 1440, off-season ranking", () => {
  test.use(DEVICES["laptop 1440"]);
  test("no 'Crowd: high' while every resort has 0 cm and no buses run", async ({
    page,
  }) => {
    // known: H — off-season: "Crowd: high (est.)" next to "0 cm new · 0 cm summit"
    test.fail(true, "known: H");
    await page.clock.install({ time: OFF_SEASON });
    await page.goto(`/?from=${FROM}&mode=drive`);
    await expect(page.getByText(/0 cm new/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Crowd: high/)).toHaveCount(0);
  });
});

for (const device of ["phone", "small phone"]) {
  test.describe(`${device}, Start a bus trip booked for tomorrow`, () => {
    test.use({
      ...DEVICES[device],
      geolocation: { latitude: 36.6985, longitude: 137.8376 },
      permissions: ["geolocation"],
    });

    test("Start does not begin live guidance now without saying the bus is tomorrow", async ({
      page,
    }) => {
      // known: M4 — Start opens live walking guidance tonight ("19:08 … at 08:06"), no date
      test.fail(true, "known: M4");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await page.getByRole("button", { name: "Start bus journey" }).click();
      await expect(
        page.getByText(/tomorrow|Jan 15|not today|isn't today/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    });
  });
}

test.describe("phone, location far away", () => {
  test.use({
    ...DEVICES.phone,
    geolocation: { latitude: 35.6812, longitude: 139.7671 }, // Tokyo
    permissions: ["geolocation"],
  });
  test("Start explains that bus guidance works near the start", async ({
    page,
  }) => {
    await openBus(page, new Date("2027-01-15T07:40:00+09:00"));
    await busAt(page, TOMORROW_8);
    await chooseTsugaike(page);
    await page.getByRole("button", { name: "Start bus journey" }).click();
    await expect(page.getByText(/works near the start/)).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ---------------------------------------------------------------------------------
// Unhappy paths and odd input
// ---------------------------------------------------------------------------------
for (const device of ["phone", "laptop 1440"]) {
  test.describe(`${device}, bus API trouble`, () => {
    test.use(DEVICES[device]);

    test("a failing bus API is reported in place; Drive still works", async ({
      page,
    }) => {
      await page.route("**/api/bus/options**", (r) =>
        r.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
      );
      await openBus(page, EVE);
      await expect(page.getByText(/Couldn't load shuttle times/)).toBeAttached({
        timeout: 20_000,
      });
      await page.getByRole("tab", { name: /Drive/ }).click();
      // the ranked list (each card's drive ETA) is Drive's answer
      await expect(
        page
          .getByText(/\d+ min/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });

    test("the bus error is visible and offers Retry", async ({ page }) => {
      // known: R — no Retry; on the phone the alert sits at the sheet's bottom edge (845–865 of 852 px)
      test.fail(true, "known: R");
      let fail = true;
      await page.route("**/api/bus/options**", (r) =>
        fail
          ? r.fulfill({
              status: 500,
              contentType: "application/json",
              body: "{}",
            })
          : r.fallback(),
      );
      await openBus(page, EVE);
      await leaveAfter(page).fill(TOMORROW_8);
      const alert = page.getByRole("alert").filter({ hasText: /shuttle/ });
      await expect(alert).toBeAttached({ timeout: 20_000 });
      expect(await inView(page, "p[role='alert']")).toBe(true);
      fail = false;
      await page
        .getByRole("button", { name: /retry|try again/i })
        .click({ timeout: 3_000 });
      await expect(resort(page, TSUGAIKE)).toBeVisible({ timeout: 20_000 });
    });

    test("a hung bus request gives up with a message instead of 'Finding buses…' forever", async ({
      page,
    }) => {
      // known: R — no timeout: "Finding buses…" stays after 60 s
      test.fail(true, "known: R");
      await page.route("**/api/bus/options**", () => {
        /* never answers */
      });
      await openBus(page, EVE);
      await leaveAfter(page).fill(TOMORROW_8);
      await expect(page.getByText("Finding buses…")).toBeVisible();
      await page.clock.fastForward("01:00");
      await expect(page.getByText("Finding buses…")).toHaveCount(0, {
        timeout: 5_000,
      });
    });

    test("slow 3G: 'Finding buses…' first, then the options", async ({
      page,
    }) => {
      await openBus(page, EVE);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 2000,
        downloadThroughput: 50_000,
        uploadThroughput: 50_000,
      });
      await leaveAfter(page).fill(TOMORROW_8);
      await expect(page.getByText("Finding buses…")).toBeVisible();
      await expect(
        resort(page, TSUGAIKE)
          .getByText(/\d\d:\d\d → \d\d:\d\d/)
          .first(),
      ).toBeVisible({ timeout: 60_000 });
    });

    test("offline mid-journey: changing the time says you're offline and keeps the chosen trip", async ({
      page,
      context,
    }) => {
      // known: R — offline: "Finding buses…" with no end, and the chosen journey disappears
      test.fail(true, "known: R");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await context.setOffline(true);
      await leaveAfter(page).fill("2027-01-15T09:00");
      await expect(
        page.getByText(/offline|no connection|couldn't load/i).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(journey(page)).toBeVisible();
    });

    test("after changing the time, the map no longer shows a trip that left the list", async ({
      page,
    }) => {
      // known: B2 — the 08:10 journey stays drawn (walk,ride, "To: Hakuba Happo Bus Terminal") after switching to 10:00
      test.fail(true, "known: B2");
      await openBus(page, EVE);
      await busAt(page, TOMORROW_8);
      await chooseTsugaike(page);
      await leaveAfter(page).fill("2027-01-15T10:00");
      await expect(
        resort(page, TSUGAIKE)
          .getByText(/^10:\d\d → /)
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      const stillChosen = await page
        .locator("button[aria-pressed='true']")
        .filter({ hasText: "→" })
        .count();
      if (stillChosen === 0)
        await expect(page.locator("main")).not.toHaveAttribute(
          "data-route-layers",
          "walk,ride",
          { timeout: 5_000 },
        );
    });

    test("a start far from Hakuba says no stops are near, not 'Couldn't load'", async ({
      page,
    }) => {
      // known: R — a Tokyo start (API no_route) shows "Couldn't load shuttle times right now."
      test.fail(true, "known: R");
      await page.clock.install({ time: EVE });
      await page.goto("/?from=35.68120,139.76710&mode=bus");
      await leaveAfter(page).fill(TOMORROW_8);
      await expect(
        page.getByText(/no (shuttle|bus) stops? (near|within)|too far/i),
      ).toBeVisible({ timeout: 20_000 });
    });
  });
}

test.describe("laptop 1280, odd dates", () => {
  test.use(DEVICES["laptop 1280"]);

  test("a past or far-future date is pulled back into today … a year ahead", async ({
    page,
  }) => {
    await openBus(page, OFF_SEASON);
    await leaveAfter(page).fill("2020-01-15T08:00");
    await expect(leaveAfter(page)).toHaveValue("2026-11-03T00:00");
    await leaveAfter(page).fill("2150-01-15T08:00");
    await expect(leaveAfter(page)).toHaveValue("2027-11-03T23:59");
    // never an API validation error (the API only takes 2000–2100)
    await expect(page.getByText(/No shuttle service/)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(
      0,
    );
  });

  test("a clamped date says so instead of silently changing what was typed", async ({
    page,
  }) => {
    // known: B3 — 2027-12-31 (in season) becomes 2027-11-03 23:59 (off-season) without a word
    test.fail(true, "known: B3");
    await openBus(page, OFF_SEASON);
    await leaveAfter(page).fill("2027-12-31T08:00");
    await expect(
      page.getByText(/up to a year ahead|within a year|too far ahead/i),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("clearing 'Leave after' still answers (now) or asks for a time", async ({
    page,
  }) => {
    // known: B4 — an empty time leaves the bus panel blank: no options, no message
    test.fail(true, "known: B4");
    await openBus(page, EVE);
    await busAt(page, TOMORROW_8);
    await leaveAfter(page).fill("");
    await expect(
      page
        .getByText(/choose a time|pick a time|enter a time/i)
        .or(resort(page, TSUGAIKE)),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("late evening says there are no more departures today", async ({
    page,
  }) => {
    await openBus(page, EVE);
    await leaveAfter(page).fill("2027-01-15T23:30");
    await expect(
      page.getByText("No more departures after this time today."),
    ).toBeVisible({ timeout: 20_000 });
  });
});
