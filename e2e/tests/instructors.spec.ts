/**
 * Anyone can ask to be an instructor; an admin approves it. Only approved
 * instructors can create courses and offerings.
 */
import { test } from "@playwright/test";
import { PASSWORD, admin, call, expect, openAs, register, uniqueEmail } from "./helpers";

test("asking to teach at sign-up waits for an admin, who approves it", async ({ page, browser }) => {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Pat");
  await page.getByLabel("Last name").fill("Prof");
  const email = uniqueEmail("pat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByLabel(/I'm an instructor/).check();
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByText("waiting for an admin to approve it")).toBeVisible();
  // Not approved yet: no Courses link.
  await expect(page.getByRole("link", { name: "Courses", exact: true })).toHaveCount(0);

  // The admin approves it in their own browser.
  const adminPage = await (await browser.newContext()).newPage();
  await openAs(adminPage, await admin(), "/admin");
  const row = adminPage.getByTestId("instructor-request").filter({ hasText: email });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0);
  await adminPage.getByText("Approved", { exact: true }).click();
  await expect(adminPage.getByTestId("instructor-request").filter({ hasText: email })).toBeVisible();

  await page.reload();
  await expect(page.getByText("You're an approved instructor.")).toBeVisible();
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  await expect(page).toHaveURL(/\/courses$/);
});

test("a rejected instructor can ask again from the dashboard", async ({ page }) => {
  const user = await register({ wantsToTeach: true });
  await call(await admin(), "post", `/admin/instructor-requests/${user.id}/reject`);
  await openAs(page, user, "/dashboard");
  await expect(page.getByText("Your last instructor request was turned down.")).toBeVisible();
  await page.getByRole("button", { name: "Request instructor access" }).click();
  await expect(page.getByText("waiting for an admin to approve it")).toBeVisible();
});

test("someone who didn't ask at sign-up can request instructor access later", async ({ page }) => {
  const user = await register();
  await openAs(page, user, "/dashboard");
  await page.getByRole("button", { name: "Request instructor access" }).click();
  await expect(page.getByText("waiting for an admin to approve it")).toBeVisible();
});

test("non-admins can't see instructor requests", async ({ page }) => {
  const user = await register();
  await openAs(page, user, "/admin");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Admins only");
});

test("users who aren't approved can't create courses", async ({ page }) => {
  const user = await register({ wantsToTeach: true });
  await openAs(page, user, "/courses");
  await page.getByLabel("Code").fill("NOPE101");
  await page.getByLabel(/^Name/).fill("Nope");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("alert")).toContainText("waiting for an admin");
});
