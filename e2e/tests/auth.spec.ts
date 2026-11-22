/**
 * Accounts: sign-up, login, logout and which pages need a login.
 */
import { test } from "@playwright/test";
import { PASSWORD, choose, expect, openAs, signupViaApi, uniqueEmail } from "./helpers";

test("home page links to log in and sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome to RollCall" })).toBeVisible();
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

for (const [role, label, path, heading] of [
  ["STUDENT", "Student", "/student", "Student"],
  ["PROCTOR", "Proctor", "/proctor", "Proctor"],
  ["INSTRUCTOR", "Instructor", "/instructor", "Instructor dashboard"],
] as const) {
  test(`signing up as ${label.toLowerCase()} lands on the ${label.toLowerCase()} page`, async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Name").fill(`New ${label}`);
    await page.getByLabel("Email").fill(uniqueEmail(role.toLowerCase()));
    await page.getByLabel(/Password/).fill(PASSWORD);
    if (role !== "STUDENT") await choose(page, "Role", label);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  });
}

test("signing up twice with the same email shows an error", async ({ page }) => {
  const existing = await signupViaApi("STUDENT");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Copycat");
  await page.getByLabel("Email").fill(existing.email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByRole("alert")).toContainText("Email already registered");
  await expect(page).toHaveURL(/\/signup$/);
});

test("login with the wrong password shows an error", async ({ page }) => {
  const user = await signupViaApi("STUDENT");
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
  await expect(page).toHaveURL(/\/login$/);
});

for (const [role, path] of [["STUDENT", "/student"], ["PROCTOR", "/proctor"], ["INSTRUCTOR", "/instructor"]] as const) {
  test(`login as ${role.toLowerCase()} goes to ${path}`, async ({ page }) => {
    const user = await signupViaApi(role);
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  for (const path of ["/student", "/proctor", "/instructor", "/instructor/courses", "/instructor/rooms", "/instructor/exams"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("logging out ends the session", async ({ page }) => {
  const user = await signupViaApi("INSTRUCTOR");
  await openAs(page, user, "/instructor");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  // The init script from openAs re-adds the token on every load, so check storage directly.
  expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
});

test("an expired or invalid token sends you back to login", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("token", "not-a-real-token"));
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login$/);
});

// Not built yet: these come from the proposal and the PR #8 review.
test.fixme("a student can't open instructor pages (role-based routes)", async ({ page }) => {
  const student = await signupViaApi("STUDENT");
  await openAs(page, student, "/instructor/courses");
  await expect(page).not.toHaveURL(/\/instructor/);
});
test.fixme("instructor sign-ups wait for admin approval", async () => {});
