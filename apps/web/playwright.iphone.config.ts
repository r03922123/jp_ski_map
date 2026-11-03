import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// iOS browsers (Safari and Chrome alike) all run Apple's WebKit. Without a device or the
// iOS Simulator, the closest stand-in is Playwright's WebKit with iPhone emulation
// (viewport, touch, user agent, pixel ratio). Not a real iPhone: no iOS keyboard, no
// Safari toolbars, no pull-to-refresh. Run: E2E_BASE_URL=https://127.0.0.1:3443
// npx playwright test -c playwright.iphone.config.ts
export default defineConfig({
  ...base,
  testDir: "./e2e-iphone",
  projects: [
    { name: "iphone-15-webkit", use: { ...devices["iPhone 15"] } },
    { name: "iphone-se-webkit", use: { ...devices["iPhone SE (3rd gen)"] } },
  ],
});
