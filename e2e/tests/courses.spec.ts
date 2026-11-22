/**
 * Instructors create courses and manage the roster.
 */
import { test } from "@playwright/test";
import { createCourse, expect, openAs, setNeeds, signupViaApi, uid, uniqueEmail, uploadRoster } from "./helpers";

test("instructor creates a course and it shows in their list", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  await openAs(page, instructor, "/instructor");
  await page.getByText("Courses & Rosters").click();
  await expect(page).toHaveURL(/\/instructor\/courses$/);
  await expect(page.getByText("No courses yet.")).toBeVisible();

  const code = `ECE${uid()}`.toUpperCase();
  await page.getByLabel("Code").fill(code);
  await page.getByLabel("Name").fill("Cloud Computing");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: `${code} — Cloud Computing` })).toBeVisible();
});

test("instructors only see their own courses", async ({ page }) => {
  const mine = await signupViaApi("INSTRUCTOR");
  const other = await signupViaApi("INSTRUCTOR");
  const theirs = await createCourse(other, `OTHER${uid()}`.toUpperCase(), "Not mine");
  await openAs(page, mine, "/instructor/courses");
  await expect(page.getByText("No courses yet.")).toBeVisible();
  await expect(page.getByText(theirs.code)).toHaveCount(0);
});

test("instructor uploads a roster by pasting CSV", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const course = await createCourse(instructor);
  await openAs(page, instructor, "/instructor/courses");
  await page.getByRole("button", { name: new RegExp(course.code) }).click();

  const ana = uniqueEmail("ana");
  const bo = uniqueEmail("bo");
  await page.getByPlaceholder(/name,email/).fill(`name,email\nAna Lee,${ana}\nBo Chen,${bo}\n`);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Added 2 of 2 entries.")).toBeVisible();
  await expect(page.getByText("Roster (2)")).toBeVisible();
  await expect(page.getByText(`Ana Lee — ${ana}`)).toBeVisible();
  await expect(page.getByText(`Bo Chen — ${bo}`)).toBeVisible();

  // Uploading the same people again doesn't duplicate them.
  await page.getByPlaceholder(/name,email/).fill(`name,email\nAna Lee,${ana}\n`);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Roster (2)")).toBeVisible();
});

test("instructor uploads a roster from a CSV file", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const course = await createCourse(instructor);
  await openAs(page, instructor, "/instructor/courses");
  await page.getByRole("button", { name: new RegExp(course.code) }).click();
  const email = uniqueEmail("file");
  await page.locator('input[type="file"]').setInputFiles({
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`name,email\nFile Person,${email}\n`),
  });
  await expect(page.getByPlaceholder(/name,email/)).toHaveValue(new RegExp(email));
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText(`File Person — ${email}`)).toBeVisible();
});

test("instructor edits and deletes roster entries", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const course = await createCourse(instructor);
  const keep = { name: "Keep Me", email: uniqueEmail("keep") };
  const drop = { name: "Drop Me", email: uniqueEmail("drop") };
  await uploadRoster(instructor, course.id, [keep, drop]);
  await openAs(page, instructor, "/instructor/courses");
  await page.getByRole("button", { name: new RegExp(course.code) }).click();

  const keepRow = page.locator("div").filter({ hasText: keep.email }).filter({ has: page.getByRole("button", { name: "Edit name" }) }).last();
  page.once("dialog", (d) => d.accept("Kept Renamed"));
  await keepRow.getByRole("button", { name: "Edit name" }).click();
  await expect(page.getByText(`Kept Renamed — ${keep.email}`)).toBeVisible();

  const dropRow = page.locator("div").filter({ hasText: drop.email }).filter({ has: page.getByRole("button", { name: "Delete" }) }).last();
  page.once("dialog", (d) => d.accept());
  await dropRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(drop.email)).toHaveCount(0);
  await expect(page.getByText("Roster (1)")).toBeVisible();
});

test("the roster shows the needs each student set for themselves", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const student = await signupViaApi("STUDENT", "Needs Person");
  await setNeeds(student, { needsAccessible: true });
  const course = await createCourse(instructor);
  await uploadRoster(instructor, course.id, [student]);
  await openAs(page, instructor, "/instructor/courses");
  await page.getByRole("button", { name: new RegExp(course.code) }).click();
  await expect(page.getByText("Accessible: Yes | Left-handed: No (set by student)")).toBeVisible();
});

// Not built yet: from the proposal and the PR #8 review.
test.fixme("instructor creates an offering (year + semester) under a course", async () => {});
test.fixme("instructor invites a proctor or co-instructor, who accepts the invite link", async () => {});
