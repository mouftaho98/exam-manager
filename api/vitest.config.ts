import { defineConfig } from "vitest/config";

// Integration tests need a Postgres database. Defaults to the dev container
// on port 55432; override with TEST_DATABASE_URL.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_test";

export default defineConfig({
  test: {
    // Tests share one database, so run files one after another.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    globalSetup: ["test/global-setup.ts"],
    env: { DATABASE_URL: testDatabaseUrl },
  },
});
