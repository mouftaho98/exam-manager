/**
 * Runs once before the whole test suite (wired up in vitest.config.ts).
 */
import { execSync } from "node:child_process";

// Bring the test database schema up to date before any test runs.
export default function setup() {
  if (process.env.SKIP_DB_SETUP) return; // unit tests only (npm run test:unit)
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_test";
  // Same command the Docker container runs on startup, pointed at the test DB.
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
