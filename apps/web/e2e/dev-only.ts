import { test } from "@playwright/test";

/**
 * Run with E2E_PROD=1 against `next start` (SPEC-deploy). The dev map handle
 * (`window.__hakubaMap`) and `?simulate` don't exist in a production build, by design:
 * tests that need them skip there and keep running against the dev server.
 */
export function devOnly(reason: string) {
  test.skip(process.env.E2E_PROD === "1", `dev-only: ${reason}`);
}
