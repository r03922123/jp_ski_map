import { expect, test } from "@playwright/test";

const HOTEL_HAKUBA = "/?from=36.69711,137.85393";
const ETA = /^ETA ~ .+ · [\d.]+ k?m$/; // "ETA ~ 25 min · 12.3 km"

// A protected preview needs Vercel's bypass header. Only on the deployment's own origin:
// extraHTTPHeaders would also send the secret to the map tile host.
test.beforeEach(async ({ page, baseURL }) => {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret || !baseURL) return;
  await page.route(`${new URL(baseURL).origin}/**`, (route) =>
    route.continue({
      headers: {
        ...route.request().headers(),
        "x-vercel-protection-bypass": secret,
        "x-vercel-set-bypass-cookie": "true",
      },
    }),
  );
});

test("security headers are sent and search engines are kept out", async ({
  page,
}) => {
  const robots = await page.goto("/robots.txt");
  expect(robots?.ok()).toBe(true);
  expect(await robots?.text()).toMatch(/User-Agent: \*\s+Disallow: \//);

  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toBe(
    "geolocation=(self), camera=(), microphone=()",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});

test("place search finds a hotel and sets the origin", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: /search/i }).fill("Hotel Hakuba");
  await page
    .getByRole("option", { name: /Hotel Hakuba/ })
    .first()
    .click({ timeout: 15_000 });
  await expect(page).toHaveURL(/from=36\.697\d*%2C137\.853/);
});

test("bus mode shows a departure and its journey", async ({ page }) => {
  await page.goto(`${HOTEL_HAKUBA}&mode=bus`);
  // 20 January: mid-season, and inside the picker's today..+1 year range
  const year = new Date().getFullYear();
  const jan20 = new Date() < new Date(`${year}-01-20`) ? year : year + 1;
  await page.getByLabel("Leave after").fill(`${jan20}-01-20T08:00`);

  const departure = page.getByText(/\d\d:\d\d → \d\d:\d\d/).first();
  await expect(departure).toBeVisible({ timeout: 15_000 });
  await departure.click();
  await expect(page.getByRole("list", { name: "Journey" })).toContainText(
    /Board \d\d:\d\d/,
  );
});

test("drive mode routes to a ranked resort with time and distance", async ({
  page,
}) => {
  await page.goto(`${HOTEL_HAKUBA}&mode=drive`);
  await page
    .getByRole("list", { name: "Ranked resorts" })
    .getByRole("button", { name: /Tsugaike/ })
    .click({ timeout: 20_000 });
  await expect(page.getByText(ETA)).toBeVisible({ timeout: 15_000 });
});

test("walk mode routes to a resort with time and distance", async ({
  page,
}) => {
  await page.goto(`${HOTEL_HAKUBA}&mode=walk&resort=happo-one`);
  await expect(page.getByText(ETA)).toBeVisible({ timeout: 15_000 });
});
