import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const API_PORT = 8010;

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run --project ../../services/api uvicorn hakuba_api.main:app --port ${API_PORT} --host 127.0.0.1`,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `pnpm dev --port ${PORT} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
