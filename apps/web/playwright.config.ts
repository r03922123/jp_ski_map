import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const API_PORT = 8010;
// Next allows one dev server per folder: while `pnpm dev:https` serves a phone, run the
// suite against it with E2E_BASE_URL=https://127.0.0.1:3443 (its self-signed cert is
// accepted for tests) instead of starting `pnpm dev`.
const BASE_URL = process.env.E2E_BASE_URL || undefined; // "" counts as unset

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: BASE_URL ?? `http://127.0.0.1:${PORT}`,
    ignoreHTTPSErrors: BASE_URL !== undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run --project ../../services/api uvicorn hakuba_api.main:app --port ${API_PORT} --host 127.0.0.1`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    ...(BASE_URL
      ? []
      : [
          {
            command: `pnpm dev --port ${PORT} --hostname 127.0.0.1`,
            url: `http://127.0.0.1:${PORT}`,
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]),
  ],
});
