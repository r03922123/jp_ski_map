import { expect, type Page, type Route, test } from "@playwright/test";

/**
 * Resilience matrix: the core journey (start → destination → route → Drive/Walk/Bus →
 * touch Start) with ONE failure injected at a time. Every test asserts the GOOD
 * behaviour (SPEC-web-app: "Each upstream error is shown inside its own panel"):
 * an explanation in place, the other panels keep working, no whole-app crash, no
 * endless spinner, recovery when the network returns. Behaviour that is broken today
 * is marked `test.fail()` with `// known: <id>`; the test flips to "unexpected pass"
 * when the bug is fixed, so drop the marker then.
 *
 * Known IDs are from docs/ux/2026-11-03-ux-review.md. Cluster R lists R1–R5 and R10 in
 * this order: R1 offline/hung spinner, R2 far-start messages, R3 no Retry + error
 * below the collapsed sheet, R4 /api/resorts failure removes the destination, R5 the
 * paste-a-link fallback, R10 malformed 200 crashes the app. X-ids are new findings.
 *
 * Representative endpoints (the full endpoint × kind × device product is ~10 min on a
 * loaded Mac): /api/routes, /api/rank, /api/resorts, /api/bus/options and
 * /api/places/suggest on the laptop; routes and bus on the phone. The badJson kind
 * (unparsable body) behaves like captive (HTML body): both are a parse error. Not covered
 * here: /api/route/path, /api/pois/nearby, /api/bus/night, /api/places/lodging.
 */

const FROM = "36.6985,137.8376";
const JOURNEY = `/?from=${FROM}&mode=drive&resort=happo-one`;
const BUS = "/?from=36.69711,137.85393&mode=bus";
const WALK_NEAR = "/?from=36.69400,137.86900&mode=walk&resort=happo-one";

const LAPTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = {
  viewport: { width: 393, height: 852 },
  hasTouch: true,
  isMobile: true,
};
const SMALL_PHONE = {
  viewport: { width: 360, height: 740 },
  hasTouch: true,
  isMobile: true,
};

type Kind = "500" | "hang" | "badJson" | "wrongShape" | "empty" | "captive";
type Endpoint = "routes" | "rank" | "resorts" | "bus" | "suggest";

const PATTERN: Record<Endpoint, string> = {
  routes: "**/api/routes?*",
  rank: "**/api/rank?*",
  resorts: "**/api/resorts",
  bus: "**/api/bus/options?*",
  suggest: "**/api/places/suggest?*",
};

function failWith(kind: Kind) {
  return (route: Route) => {
    switch (kind) {
      case "500":
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: "{}",
        });
      case "hang":
        return; // never answered: a request stuck on weak mountain signal
      case "badJson":
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{not json",
        });
      case "wrongShape":
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      case "empty":
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      case "captive":
        return route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html><body><h1>Hotel Wi-Fi</h1>Please log in</body></html>",
        });
    }
  };
}

const directions = (page: Page) =>
  page.getByRole("region", { name: "Directions" });
const crashed = (page: Page) =>
  page.getByRole("heading", { name: "Something went wrong" });
const eta = (page: Page) =>
  directions(page)
    .getByText(/^ETA ~ \d/)
    .first();
const ranked = (page: Page) =>
  page.getByRole("list", { name: "Ranked resorts" });

/** What the failing endpoint's panel should say, and how to prove the rest works. */
const PANEL: Record<
  Endpoint,
  {
    url: string;
    explanation: RegExp;
    /** shown while the request is in flight */
    pending?: RegExp;
    /** opens the panel that uses the endpoint, after load */
    trigger?: (page: Page) => Promise<void>;
    othersWork: (page: Page) => Promise<void>;
  }
> = {
  routes: {
    url: JOURNEY,
    explanation: /route/i,
    pending: /Finding route/,
    othersWork: async (page) => {
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    },
  },
  rank: {
    url: JOURNEY,
    explanation: /rank|resorts/i,
    pending: /Ranking resorts/,
    othersWork: async (page) => {
      await expect(eta(page)).toBeVisible({ timeout: 20_000 });
    },
  },
  resorts: {
    url: JOURNEY,
    explanation: /resort/i,
    othersWork: async (page) => {
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    },
  },
  bus: {
    url: BUS,
    explanation: /shuttle|bus/i,
    pending: /Finding buses/,
    othersWork: async (page) => {
      await page.getByRole("tab", { name: /drive/i }).click();
      await expect(ranked(page)).toBeVisible({ timeout: 20_000 });
    },
  },
  suggest: {
    url: JOURNEY,
    explanation: /search/i,
    trigger: async (page) => {
      await page.getByRole("combobox").first().fill("Happo");
    },
    othersWork: async (page) => {
      await expect(eta(page)).toBeVisible({ timeout: 20_000 });
    },
  },
};

type Row = {
  endpoint: Endpoint;
  kind: Kind;
  device: "laptop" | "phone";
  /** the known bug that makes this row fail today, if any */
  known?: string;
};

const ROWS: Row[] = [
  // the route panel
  { endpoint: "routes", kind: "500", device: "laptop" },
  { endpoint: "routes", kind: "500", device: "phone" },
  // known: R1 — a hung /api/routes shows "Finding route…" forever (no timeout)
  { endpoint: "routes", kind: "hang", device: "laptop", known: "R1" },
  { endpoint: "routes", kind: "hang", device: "phone", known: "R1" },
  // known: R10 — a 200 with the wrong JSON shape takes down the whole app
  { endpoint: "routes", kind: "wrongShape", device: "laptop", known: "R10" },
  { endpoint: "routes", kind: "captive", device: "laptop" },
  // the ranked resort list
  { endpoint: "rank", kind: "500", device: "laptop" },
  // known: R1 — a hung /api/rank shows "Ranking resorts…" forever
  { endpoint: "rank", kind: "hang", device: "laptop", known: "R1" },
  // known: R10 — /api/rank 200 `{}` crashes the whole app
  { endpoint: "rank", kind: "wrongShape", device: "laptop", known: "R10" },
  // known: R16 — an empty list says "No resorts match these filters" with no filters set
  { endpoint: "rank", kind: "empty", device: "laptop", known: "R16" },
  // the resort catalogue (destination, map labels)
  // known: R4 — /api/resorts failing silently removes the destination (no message)
  { endpoint: "resorts", kind: "500", device: "laptop", known: "R4" },
  // known: R10 — /api/resorts 200 `{}` crashes the whole app
  { endpoint: "resorts", kind: "wrongShape", device: "laptop", known: "R10" },
  // known: R4 — an empty catalogue silently drops the destination too
  { endpoint: "resorts", kind: "empty", device: "laptop", known: "R4" },
  // the bus panel
  { endpoint: "bus", kind: "500", device: "laptop" },
  { endpoint: "bus", kind: "500", device: "phone" },
  // known: R1 — a hung /api/bus/options shows "Finding buses…" forever
  { endpoint: "bus", kind: "hang", device: "laptop", known: "R1" },
  // known: R10 — /api/bus/options 200 `{}` crashes the whole app
  { endpoint: "bus", kind: "wrongShape", device: "laptop", known: "R10" },
  // search
  { endpoint: "suggest", kind: "500", device: "laptop" },
  // known: R10 — /api/places/suggest 200 `{}` crashes the whole app while typing
  { endpoint: "suggest", kind: "wrongShape", device: "laptop", known: "R10" },
];

async function settle(page: Page, panel: (typeof PANEL)[Endpoint]) {
  // whatever happens first: an explanation, the crash screen, or the endless spinner
  await expect(
    directions(page)
      .getByRole("alert")
      .or(crashed(page))
      .or(directions(page).getByText(panel.pending ?? /^￿$/))
      .or(directions(page).getByText(/^ETA ~ \d|No resorts match/))
      .first(),
  ).toBeVisible({ timeout: 25_000 });
}

test.describe("one endpoint fails: explained in its own panel, the rest works", () => {
  for (const row of ROWS) {
    const panel = PANEL[row.endpoint];
    test.describe(`${row.device}`, () => {
      test.use(row.device === "phone" ? PHONE : LAPTOP);

      test(`${row.endpoint} → ${row.kind}`, async ({ page }) => {
        if (row.known) test.fail();
        await page.route(PATTERN[row.endpoint], failWith(row.kind));
        if (row.kind === "hang") await page.clock.install();
        await page.goto(panel.url);
        await expect(directions(page)).toBeVisible({ timeout: 20_000 });
        if (panel.trigger) await panel.trigger(page);

        if (row.kind === "hang") {
          if (panel.pending)
            await expect(directions(page).getByText(panel.pending)).toBeVisible(
              { timeout: 20_000 },
            );
          // skip ahead two minutes: no spinner should outlive that on any network
          await page.clock.fastForward("02:00");
        } else {
          await settle(page, panel);
        }

        await expect(crashed(page)).toHaveCount(0);
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: panel.explanation })
            .first(),
        ).toBeVisible({ timeout: 10_000 });
        if (row.endpoint === "rank" && row.kind === "empty") {
          // nothing came back: don't blame filters the user never set
          await expect(directions(page)).not.toContainText(
            "No resorts match these filters",
          );
        }
        await panel.othersWork(page);
        await expect(crashed(page)).toHaveCount(0);
      });
    });
  }
});

test.describe("an error offers a way out", () => {
  for (const [name, device] of [["laptop", LAPTOP]] as const) {
    test.describe(name, () => {
      test.use(device);

      test("the route error has a Retry that recovers", async ({ page }) => {
        // known: R3 — errors have no Retry; only changing the trip refetches
        test.fail();
        let failing = true;
        await page.route(PATTERN.routes, (r) =>
          failing ? failWith("500")(r) : r.continue(),
        );
        await page.goto(JOURNEY);
        const alert = directions(page)
          .getByRole("alert")
          .filter({ hasText: /route/i });
        await expect(alert).toHaveCount(1, { timeout: 25_000 });
        failing = false;
        await directions(page)
          .getByRole("button", { name: /retry|try again/i })
          .click({ timeout: 3_000 });
        await expect(eta(page)).toBeVisible({ timeout: 20_000 });
      });
    });
  }

  test.describe("360×740", () => {
    test.use(SMALL_PHONE);

    test("the route error is visible in the collapsed sheet, with Retry", async ({
      page,
    }) => {
      // known: R3 — the error renders below the fold of the collapsed sheet, no Retry
      test.fail();
      await page.route(PATTERN.routes, failWith("500"));
      await page.goto(JOURNEY);
      const alert = directions(page)
        .getByRole("alert")
        .filter({ hasText: /route/i });
      await expect(alert).toHaveCount(1, { timeout: 25_000 });
      await expect(alert).toBeInViewport({ timeout: 3_000 });
      await expect(
        directions(page).getByRole("button", { name: /retry|try again/i }),
      ).toBeInViewport({ timeout: 1_000 });
    });
  });
});

test.describe("offline mid-journey, then back online", () => {
  const cases = [
    {
      name: "phone: switch to Walk",
      device: PHONE,
      tab: /walk/i,
      done: (page: Page) => eta(page),
    },
    {
      name: "laptop: switch to Bus",
      device: LAPTOP,
      tab: /bus/i,
      done: (page: Page) =>
        directions(page)
          .getByText(/shuttle service|Board|→/)
          .first(),
    },
  ];
  for (const c of cases) {
    test.describe(c.name, () => {
      test.use(c.device);

      test("says it's offline instead of spinning", async ({
        page,
        context,
      }) => {
        // known: R1 — paused queries show "Finding route…/buses…" with no offline notice
        test.fail();
        await page.goto(JOURNEY);
        await expect(eta(page)).toBeVisible({ timeout: 25_000 });
        await context.setOffline(true);
        await page.getByRole("tab", { name: c.tab }).click();
        await expect(
          page.getByText(/offline|no connection|no signal|connection/i).first(),
        ).toBeVisible({ timeout: 8_000 });
      });

      test("recovers without a reload when the network returns", async ({
        page,
        context,
      }) => {
        await page.goto(JOURNEY);
        await expect(eta(page)).toBeVisible({ timeout: 25_000 });
        await context.setOffline(true);
        await page.getByRole("tab", { name: c.tab }).click();
        await expect(
          directions(page)
            .getByText(/Finding/)
            .first(),
        ).toBeVisible({
          timeout: 10_000,
        });
        await context.setOffline(false);
        await expect(c.done(page)).toBeVisible({ timeout: 20_000 });
        await expect(crashed(page)).toHaveCount(0);
      });
    });
  }
});

test.describe("slow 3G", () => {
  test.use(PHONE);

  test("a shared link never asks for a start it already has", async ({
    page,
    context,
  }) => {
    // known: R15 — the server HTML says "set your starting point" until hydration
    test.fail();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    // Chrome's "Fast 3G" preset (562.5 ms, 1.6 Mbps): slow enough to see first paint
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 563,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await page.goto(JOURNEY, { waitUntil: "commit" });
    await expect(directions(page)).toBeVisible({ timeout: 30_000 });
    await expect(directions(page)).not.toContainText(
      /set your starting point/,
      {
        timeout: 1_000,
      },
    );
  });
});

test.describe("invalid URL states are explained, and the app stays usable", () => {
  test.use(LAPTOP);
  const cases = [
    // known: R15 — an out-of-range start is dropped silently from the URL
    { q: "?from=999,999&mode=drive&resort=happo-one", known: "R15" },
    // known: R15 — an unknown resort id is ignored silently (and kept in the URL)
    { q: `?from=${FROM}&mode=drive&resort=nope`, known: "R15" },
    // known: R15 — an unparsable dest=pt: is dropped silently
    { q: `?from=${FROM}&mode=drive&dest=pt:abc`, known: "R15" },
  ];
  for (const c of cases) {
    test(`${c.q} says the link was partly unreadable`, async ({ page }) => {
      if (c.known) test.fail();
      await page.goto(`/${c.q}`);
      await expect(directions(page)).toBeVisible({ timeout: 20_000 });
      await expect(crashed(page)).toHaveCount(0);
      await expect(
        page.getByText(/link|couldn't read|not found|invalid|unknown/i).first(),
      ).toBeVisible({ timeout: 5_000 });
    });
  }

  test("mode=fly falls back to Drive and still routes", async ({ page }) => {
    await page.goto(`/?from=${FROM}&mode=fly&resort=happo-one`);
    await expect(page.getByRole("tab", { name: /drive/i })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 20_000 },
    );
    await expect(eta(page)).toBeVisible({ timeout: 25_000 });
    await expect(crashed(page)).toHaveCount(0);
  });
});

test.describe("touch Start with location denied", () => {
  test.use({ ...PHONE, permissions: [] });

  test("explains, offers a way back, and does not also wait for GPS", async ({
    page,
  }) => {
    // known: R7 — "Location is off … start again" alert while the footer says
    // "Waiting for GPS…" forever
    test.fail();
    await page.goto(WALK_NEAR);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 25_000 });
    const pilotAlert = page.getByRole("alert").filter({ hasText: /location/i });
    await expect(pilotAlert).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: "Exit navigation" }),
    ).toBeVisible();
    await expect(page.getByText("Waiting for GPS…")).toHaveCount(0, {
      timeout: 3_000,
    });
  });

  test("Exit returns to the directions", async ({ page }) => {
    await page.goto(WALK_NEAR);
    await page
      .getByRole("button", { name: "Start navigation" })
      .click({ timeout: 25_000 });
    await expect(
      page.getByRole("alert").filter({ hasText: /location/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Exit navigation" }).click();
    await expect(eta(page)).toBeVisible({ timeout: 10_000 });
  });
});
