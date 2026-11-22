/**
 * Courses (catalog entries) and offerings (one run of a course in a term).
 */
import { test } from "@playwright/test";
import { choose, createCourse, createOffering, expect, instructor, join, openAs, register, seedOffering, uid } from "./helpers";

test("instructor creates a course, then a Fall 2026 offering of it", async ({ page }) => {
  const prof = await instructor();
  await openAs(page, prof, "/dashboard");
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  const code = `ECE${uid()}`.toUpperCase();
  await page.getByLabel("Code").fill(code.toLowerCase()); // stored uppercase
  await page.getByLabel(/^Name/).fill("Introduction to Cloud Computing");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("heading", { name: `${code} — Introduction to Cloud Computing` })).toBeVisible();
  await expect(page.getByText("No offerings yet.")).toBeVisible();

  await choose(page, "Semester", "Fall");
  await page.getByLabel("Year").fill("2026");
  await page.getByRole("button", { name: "Add offering" }).click();
  await expect(page).toHaveURL(/\/offerings\//);
  await expect(page.getByRole("heading", { name: `${code} — Fall 2026` })).toBeVisible();
  await expect(page.getByText("You're an instructor")).toBeVisible();

  // It's on the dashboard with the instructor role.
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(`${code} .*Fall 2026`) })).toBeVisible();
});

test("a course code that already exists links to the existing course", async ({ page }) => {
  const other = await instructor();
  const existing = await createCourse(other);
  const prof = await instructor();
  await openAs(page, prof, "/courses");
  await page.getByLabel("Code").fill(existing.code);
  await page.getByLabel(/^Name/).fill("Duplicate");
  await page.getByRole("button", { name: "Create course" }).click();
  await expect(page.getByRole("alert")).toContainText(`${existing.code} already exists`);
  await page.getByRole("link", { name: "Open it" }).click();
  await expect(page.getByRole("heading", { name: `${existing.code} — ${existing.name}` })).toBeVisible();
});

test("any approved instructor can add a new term to an existing course", async ({ page }) => {
  const { course } = await seedOffering(); // someone else's Fall 2026
  const prof = await instructor();
  await openAs(page, prof, `/courses/${course.id}`);
  await expect(page.getByText("Fall 2026")).toBeVisible();
  await choose(page, "Semester", "Winter");
  await page.getByLabel("Year").fill("2027");
  await page.getByRole("button", { name: "Add offering" }).click();
  await expect(page.getByRole("heading", { name: `${course.code} — Winter 2027` })).toBeVisible();
});

test("the same term can't be added twice", async ({ page }) => {
  const { prof, course } = await seedOffering();
  await openAs(page, prof, `/courses/${course.id}`);
  await choose(page, "Semester", "Fall");
  await page.getByLabel("Year").fill("2026");
  await page.getByRole("button", { name: "Add offering" }).click();
  await expect(page.getByRole("alert")).toContainText("already has an offering that term");
  await page.getByRole("link", { name: "Open it" }).click();
  await expect(page.getByRole("heading", { name: `${course.code} — Fall 2026` })).toBeVisible();
});

test("courses can be searched by code or name", async ({ page }) => {
  const prof = await instructor();
  const tag = uid();
  const course = await createCourse(prof, `SRCH${tag}`.toUpperCase(), `Searchable ${tag}`);
  await openAs(page, prof, "/courses");
  await page.getByLabel("Search courses").fill(`searchable ${tag}`);
  await expect(page.getByRole("link", { name: `${course.code} — ${course.name}` })).toBeVisible();
  await page.getByLabel("Search courses").fill(`no-such-course-${tag}`);
  await expect(page.getByText("No courses found.")).toBeVisible();
});

test("the course page shows my role in each offering", async ({ page }) => {
  const { prof, course, offering } = await seedOffering();
  await createOffering(prof, course.id, 2027, "WINTER");
  const proctor = await register();
  await join(prof, offering.id, proctor, "PROCTOR");
  const viewer = await instructor();
  await join(prof, offering.id, viewer, "INSTRUCTOR");
  await openAs(page, viewer, `/courses/${course.id}`);
  await expect(page.getByRole("link", { name: "Fall 2026" })).toBeVisible();
  await expect(page.getByText("Winter 2027")).toBeVisible();
  await expect(page.getByRole("link", { name: "Winter 2027" })).toHaveCount(0); // not a member there
});

test("people who aren't in an offering can't open it", async ({ page }) => {
  const { offering } = await seedOffering();
  const stranger = await register();
  await openAs(page, stranger, `/offerings/${offering.id}`);
  await expect(page.getByRole("alert")).toContainText("not found");
});
