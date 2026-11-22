/**
 * Students set their own seating needs; instructors don't.
 */
import { test } from "@playwright/test";
import { expect, openAs, signupViaApi } from "./helpers";

test("student turns on accessible and left-handed seating and it sticks", async ({ page }) => {
  const student = await signupViaApi("STUDENT");
  await openAs(page, student, "/student");
  const accessible = page.getByLabel("I need accessible seating");
  const leftHanded = page.getByLabel("I need left-handed seating");
  await expect(accessible).not.toBeChecked();
  // Mantine hides the real checkbox, so click the label like a user would.
  await page.getByText("I need accessible seating").click();
  await page.getByText("I need left-handed seating").click();
  await expect(accessible).toBeChecked();

  await page.reload();
  await expect(page.getByLabel("I need accessible seating")).toBeChecked();
  await expect(page.getByLabel("I need left-handed seating")).toBeChecked();

  await page.getByText("I need left-handed seating").click();
  await expect(page.getByLabel("I need left-handed seating")).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel("I need left-handed seating")).not.toBeChecked();
});

test("a student with no exams sees an empty state", async ({ page }) => {
  const student = await signupViaApi("STUDENT");
  await openAs(page, student, "/student");
  await expect(page.getByRole("textbox", { name: "Your exams" })).toBeDisabled();
  await expect(page.getByPlaceholder("No exams found")).toBeVisible();
});
