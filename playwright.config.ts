import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only magic links are written here so the sign-in E2E can follow them (src/lib/auth-dev-email.ts). */
export const MAGIC_LINK_FILE = path.resolve(".playwright/magic-links.jsonl");
/**
 * Admin accounts for E2E: one per test slot and browser project, so parallel tests
 * never share (and invalidate) each other's single-use magic links. Granted ADMIN by
 * the E2E dev server (this overrides ADMIN_EMAILS from .env for that server only).
 */
export const E2E_PROJECTS = ["chromium", "mobile"] as const;
export const e2eAdminEmail = (project: string, slot: number) =>
  `e2e-admin-${project}-${slot}@example.com`;
const E2E_ADMIN_EMAILS = E2E_PROJECTS.flatMap((p) =>
  Array.from({ length: 17 }, (_, i) => i + 1).map((slot) => e2eAdminEmail(p, slot)),
).join(",");
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E tests (PRD §11). Locally this starts `pnpm dev`; set PLAYWRIGHT_BASE_URL to
 * run against a deployed preview instead (no local server is started then).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
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
        env: {
          E2E_MAGIC_LINK_FILE: MAGIC_LINK_FILE,
          AUTH_RESEND_KEY: "",
          ADMIN_EMAILS: E2E_ADMIN_EMAILS,
          // Payments go through the built-in dev gateway (/dev/paystack), never Paystack.
          PAYSTACK_SECRET_KEY: "",
          // The simulated courier (US-D5): live delivery prices and booking, no network.
          COURIER_DEV: "true",
          SENDBOX_API_KEY: "",
          // No floating dev-tools button over the app on mobile viewports.
          DISABLE_DEV_INDICATORS: "1",
        },
      },
});
