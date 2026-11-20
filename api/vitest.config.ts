/**
 * Test runner settings (Vitest). `npm test` uses this file.
 */
import { defineConfig } from "vitest/config";

// Integration tests need a Postgres database. Defaults to the dev container
// on port 55432; override with TEST_DATABASE_URL.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_test";

export default defineConfig({
  test: {
    // Tests share one database, so run files one after another.
    fileParallelism: false,
    // Generous limits: some tests make many requests in a row.
    testTimeout: 30000,
    hookTimeout: 60000,
    // Applies migrations to the test DB before anything runs.
    globalSetup: ["test/global-setup.ts"],
    // Environment variables the app sees while tests run.
    env: { DATABASE_URL: testDatabaseUrl, JWT_SECRET: "test-secret" },
  },
});
