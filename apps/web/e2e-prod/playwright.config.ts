import { defineConfig, devices } from "@playwright/test";

// Smoke suite for a deployed site (SPEC-deploy item 10). No local servers, no dev hooks.
// Run from apps/web: PROD_URL=https://<url> pnpm exec playwright test -c e2e-prod/playwright.config.ts
// A protected preview also needs VERCEL_AUTOMATION_BYPASS_SECRET (sent by smoke.spec.ts).
const PROD_URL = process.env.PROD_URL;
if (!PROD_URL) {
  throw new Error(
    "e2e-prod: set PROD_URL to the deployment, e.g. PROD_URL=https://jp-ski-map.vercel.app",
  );
}

export default defineConfig({
  testDir: ".",
  // one browser, one retry: a few dozen API calls stay far under the per-client limit
  workers: 1,
  retries: 1,
  use: {
    baseURL: PROD_URL,
    // the title screen shows once per browser session; the smoke tests start past it
    storageState: {
      cookies: [
        {
          name: "hakuba_title",
          value: "seen",
          domain: new URL(PROD_URL).hostname,
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    trace: "retain-on-failure",
  },
  // Desktop Chrome, like the main suite: the flows and selectors below are the ones it proves
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
