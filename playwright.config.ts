import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only magic links are written here so the sign-in E2E can follow them (src/lib/auth-dev-email.ts). */
export const MAGIC_LINK_FILE = path.resolve(".playwright/magic-links.jsonl");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E tests (PRD §11). Locally this starts `pnpm dev`; set PLAYWRIGHT_BASE_URL to
 * run against a deployed preview instead (no local server is started then).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Optional: use a pre-installed Chromium instead of `playwright install`'s download.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { E2E_MAGIC_LINK_FILE: MAGIC_LINK_FILE, AUTH_RESEND_KEY: "" },
      },
});
