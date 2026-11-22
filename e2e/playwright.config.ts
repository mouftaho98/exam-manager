/**
 * End-to-end UI tests for RollCall.
 *
 * `npm test` starts its own API (port 3100, against a throwaway Postgres
 * database) and the Vite dev server (port 5174), then drives the real UI in
 * Chromium. Every test signs up its own users with unique emails, so tests
 * never depend on each other or on what's already in the database.
 *
 * Read-only checks against the deployed site live in playwright.live.config.ts.
 */
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 3100;
const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_e2e";
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "tests",
  testIgnore: "live/**",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 4,
  reporter: CI ? [["list"], ["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Apply migrations to the e2e database, then run the API from source.
      name: "api",
      command: "npx prisma migrate deploy && npx tsx src/index.ts",
      cwd: "../api",
      url: `${API_URL}/ready`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        JWT_SECRET: "e2e-secret",
        CORS_ORIGIN: "*",
        REDIS_URL: "",
        // So invite links in the UI point at the test web server.
        WEB_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      name: "web",
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: "../web",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
