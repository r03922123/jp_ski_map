import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// iOS and iPadOS browsers (Safari and Chrome alike) all run Apple's WebKit. Without a device or the
// iOS Simulator, the closest stand-in is Playwright's WebKit with iPhone emulation
// (viewport, touch, user agent, pixel ratio). Not a real iPhone: no iOS keyboard, no
// Safari toolbars, no pull-to-refresh. Run: E2E_BASE_URL=https://127.0.0.1:3443
// npx playwright test -c playwright.iphone.config.ts
// An iPhone 12-class phone in iOS 27 Safari, measured on a real device in 2026-11:
// Safari leaves 390×699 (iOS 27's compact bars) of a 390×844 screen at 3×. Safari's user
// agent freezes the OS part at 18_7. English UI, a visitor's time zone outside Japan
// (UTC+8). Used when no phone is plugged in.
const IPHONE_12_TWIN = {
  ...devices["iPhone 12"],
  viewport: { width: 390, height: 699 },
  screen: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  locale: "en-US",
  timezoneId: "Asia/Taipei",
  colorScheme: "light" as const,
};

const IPAD = {
  ...devices["iPad Pro 11"],
  isMobile: false, // desktop-class Safari: no mobile viewport meta quirks
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
};

export default defineConfig({
  ...base,
  testDir: "./e2e-iphone",
  projects: [
    { name: "iphone-12-twin-webkit", use: IPHONE_12_TWIN },
    { name: "iphone-15-webkit", use: { ...devices["iPhone 15"] } },
    { name: "iphone-se-webkit", use: { ...devices["iPhone SE (3rd gen)"] } },
    // an iPad Air-class tablet (820×1180 pt): Safari's own bars leave about 820×1080
    // upright and 1180×740 on its side. iPadOS Safari asks for desktop sites by default, so
    // it sends a Mac user agent; touch and size are what make it a tablet
    {
      name: "ipad-air-webkit",
      use: { ...IPAD, viewport: { width: 820, height: 1080 } },
    },
    // an iPad mini (744 pt wide): under the 768 px breakpoint, so it gets the phone layout
    // on a tall screen
    {
      name: "ipad-mini-webkit",
      use: { ...IPAD, viewport: { width: 744, height: 1030 } },
    },
    {
      name: "ipad-air-landscape-webkit",
      use: { ...IPAD, viewport: { width: 1180, height: 740 } },
    },
  ],
});
