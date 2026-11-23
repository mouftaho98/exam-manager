/**
 * Read-only smoke checks against the deployed site (`npm run test:live`).
 * These never sign up or change anything, so they're safe to run against
 * production. Override the targets with LIVE_URL and LIVE_API_URL.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/live",
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_URL ?? "http://uoft-rollcall.duckdns.org",
    trace: "retain-on-failure",
  },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"] } }],
});
