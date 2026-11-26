/**
 * Students set their own seating needs (at sign-up or later). Staff don't get
 * a "My seating needs" card unless they're also a student somewhere.
 */
import { test } from "@playwright/test";
import { PASSWORD, expect, instructor, join, openAs, register, seedOffering, uniqueEmail } from "./helpers";

test("seating needs chosen at sign-up are saved", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Lefty");
  await page.getByLabel("Last name").fill("Writer");
  await page.getByLabel("Email").fill(uniqueEmail("lefty"));
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByText("I'm left-handed").click();
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("I'm left-handed")).toBeChecked();
  await expect(page.getByLabel("I need an accessible seat")).not.toBeChecked();
});

test("students change their seating needs on the dashboard and they stick", async ({ page }) => {
  const user = await register();
  await openAs(page, user, "/dashboard");
  // Mantine hides the real checkbox, so click the label like a person would.
  await page.getByText("I need an accessible seat").click();
  await expect(page.getByLabel("I need an accessible seat")).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("I need an accessible seat")).toBeChecked();
  await page.getByText("I need an accessible seat").click();
  await expect(page.getByLabel("I need an accessible seat")).not.toBeChecked(); // saved
  await page.reload();
  await expect(page.getByLabel("I need an accessible seat")).not.toBeChecked();
});

test("instructors don't see their own seating needs", async ({ page }) => {
  await openAs(page, await instructor(), "/dashboard");
  await expect(page.getByText("My seating needs")).toHaveCount(0);
});

test("an instructor who also sits a course still sees their seating needs", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const teachingStudent = await instructor();
  await join(prof, offering.id, teachingStudent, "STUDENT");
  await openAs(page, teachingStudent, "/dashboard");
  await expect(page.getByText("My seating needs")).toBeVisible();
});
