/**
 * Read-only checks against the deployed site. Nothing here signs up or
 * writes data, so it's safe to point at production.
 */
import { expect, test } from "@playwright/test";

const API_URL = process.env.LIVE_API_URL ?? "http://209.38.1.216";

test("API is up and can reach the database", async ({ request }) => {
  expect((await request.get(`${API_URL}/health`)).ok()).toBe(true);
  const ready = await request.get(`${API_URL}/ready`);
  expect(ready.ok()).toBe(true);
  expect(await ready.json()).toEqual({ ok: true });
});

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/RollCall/);
  await expect(page.getByRole("heading", { name: "Welcome to RollCall" })).toBeVisible();
});

test("login and sign-up pages render, and deep links work", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("a wrong password is rejected by the live API", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.invalid");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
