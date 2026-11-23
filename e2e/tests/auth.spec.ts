/**
 * Accounts: sign-up, login, logout, and pages that need a login.
 */
import { test } from "@playwright/test";
import { PASSWORD, expect, openAs, register, uniqueEmail } from "./helpers";

test("home page links to log in and sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to RollCall" })).toBeVisible();
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("sign up with first and last name lands on the dashboard", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Ana");
  await page.getByLabel("Last name").fill("Lee");
  await page.getByLabel("Email").fill(uniqueEmail("ana"));
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Hi, Ana" })).toBeVisible();
  await expect(page.getByText("You haven't joined any courses yet")).toBeVisible();
});

test("signing up with an email that already has an account shows an error", async ({ page }) => {
  const existing = await register();
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Copy");
  await page.getByLabel("Last name").fill("Cat");
  await page.getByLabel("Email").fill(existing.email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page).toHaveURL(/\/signup$/);
});

test("login with the wrong password shows an error and stays on the page", async ({ page }) => {
  const user = await register();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toContainText("Wrong email or password");
  await expect(page).toHaveURL(/\/login$/);
});

test("login works with any capitalisation of the email", async ({ page }) => {
  const user = await register();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email.toUpperCase());
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-out visitors go to login, then back to the page they wanted", async ({ page }) => {
  const user = await register();
  for (const path of ["/dashboard", "/courses", "/rooms", "/admin", "/offerings/x", "/exams/x"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
  await page.goto("/rooms");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
});

test("logging out ends the session", async ({ page }) => {
  const user = await register();
  await openAs(page, user, "/dashboard");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("an invalid or expired token sends you back to login", async ({ page }) => {
  await openAs(page, { token: "not-a-real-token" }, "/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("old role pages from the first UI redirect to the dashboard", async ({ page }) => {
  const user = await register();
  await openAs(page, user, "/proctor");
  await expect(page).toHaveURL(/\/dashboard$/);
});
