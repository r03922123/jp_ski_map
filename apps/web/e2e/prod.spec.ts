import { expect, test } from "@playwright/test";

// SPEC-deploy v1.5: what a public deployment sends besides the app itself.

test("pages carry the security headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  // navigation needs GPS on our own origin, nowhere else
  expect(headers["permissions-policy"]).toBe(
    "geolocation=(self), camera=(), microphone=()",
  );
});

test("search engines are asked to stay away", async ({ page, request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toMatch(/User-Agent: \*\s+Disallow: \//);

  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});
