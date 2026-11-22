/**
 * Exam day: proctors check students in and watch the live dashboard.
 */
import { test, type Page } from "@playwright/test";
import { choose, expect, openAs, registerBarcode, seedExam, signupViaApi, uid } from "./helpers";

async function openExam(page: Page, examTitle: string) {
  await choose(page, "Exam", new RegExp(examTitle));
  await expect(page.getByText(/Checked in: \d+ \/ \d+/)).toBeVisible();
}

test("proctor checks a student in by searching their name", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 3 });
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);
  await expect(page.getByText("Checked in: 0 / 3 (Missing: 3)")).toBeVisible();

  const student = students[1];
  await choose(page, "Student (search by name or email)", new RegExp(student.email), student.name);
  await page.getByRole("button", { name: "Check in student" }).click();
  await expect(page.getByText(new RegExp(`Checked in: ${student.name} at seat [A-Z]\\d+`))).toBeVisible();
  await expect(page.getByText("Checked in: 1 / 3 (Missing: 2)")).toBeVisible();
});

test("checking the same student in twice doesn't double count", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 2 });
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);
  for (let i = 0; i < 2; i++) {
    await choose(page, "Student (search by name or email)", new RegExp(students[0].email), students[0].name);
    await page.getByRole("button", { name: "Check in student" }).click();
    await expect(page.getByText("Checked in: 1 / 2 (Missing: 1)")).toBeVisible();
  }
});

test("a check-in in one proctor's browser shows up live in another's", async ({ browser }) => {
  const { students, exam } = await seedExam({ students: 2 });
  const proctorA = await signupViaApi("PROCTOR");
  const proctorB = await signupViaApi("PROCTOR");
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  await openAs(pageA, proctorA, "/proctor");
  await openAs(pageB, proctorB, "/proctor");
  await openExam(pageA, exam.title);
  await openExam(pageB, exam.title);
  await expect(pageB.getByText("Checked in: 0 / 2 (Missing: 2)")).toBeVisible();

  await choose(pageA, "Student (search by name or email)", new RegExp(students[0].email), students[0].name);
  await pageA.getByRole("button", { name: "Check in student" }).click();

  // No reload on B: the update arrives over Socket.IO.
  await expect(pageB.getByText("Checked in: 1 / 2 (Missing: 1)")).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});

test("proctor checks a student in by typing their card barcode", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 2 });
  const barcode = `9${Date.now()}`;
  registerBarcode(barcode, students[0]);
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);

  await page.getByLabel("Or enter barcode manually").fill(barcode);
  await page.getByRole("button", { name: "Check in by barcode" }).click();
  await expect(page.getByText(new RegExp(`Checked in: ${students[0].name} at seat`))).toBeVisible();
  await expect(page.getByText("Checked in: 1 / 2 (Missing: 1)")).toBeVisible();

  // Scanning the same card again says so instead of counting twice.
  await page.getByLabel("Or enter barcode manually").fill(barcode);
  await page.getByRole("button", { name: "Check in by barcode" }).click();
  await expect(page.getByText("Already checked in")).toBeVisible();
});

test("an unknown barcode shows an error", async ({ page }) => {
  const { exam } = await seedExam({ students: 1 });
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);
  await page.getByLabel("Or enter barcode manually").fill(`unknown-${uid()}`);
  await page.getByRole("button", { name: "Check in by barcode" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Barcode not registered");
});

test("the dashboard lists who's checked in and who's missing, and has a map view", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 2 });
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);
  await choose(page, "Student (search by name or email)", new RegExp(students[0].email), students[0].name);
  await page.getByRole("button", { name: "Check in student" }).click();
  await expect(page.getByText("Checked in: 1 / 2 (Missing: 1)")).toBeVisible();

  const rowFor = (name: string) => page.locator("div").filter({ hasText: name }).filter({ hasText: /Checked in$|Missing$/ }).last();
  await expect(rowFor(students[0].name)).toContainText("Checked in");
  await expect(rowFor(students[1].name)).toContainText("Missing");

  // Check in the other student too, so whoever is first in the list has been
  // updated by a live event (that used to wipe out the map).
  await choose(page, "Student (search by name or email)", new RegExp(students[1].email), students[1].name);
  await page.getByRole("button", { name: "Check in student" }).click();
  await expect(page.getByText("Checked in: 2 / 2 (Missing: 0)")).toBeVisible();

  await page.getByText("Map", { exact: true }).click();
  await expect(page.getByText("No seat map available.")).toHaveCount(0);
});

test("a student sees they're checked in", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 1 });
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/proctor");
  await openExam(page, exam.title);
  await choose(page, "Student (search by name or email)", new RegExp(students[0].email), students[0].name);
  await page.getByRole("button", { name: "Check in student" }).click();
  await expect(page.getByText("Checked in: 1 / 1 (Missing: 0)")).toBeVisible();

  const studentPage = await page.context().browser()!.newPage();
  await openAs(studentPage, students[0], "/student");
  await choose(studentPage, "Your exams", new RegExp(exam.title));
  await expect(studentPage.getByText("Checked in: Yes")).toBeVisible();
  await studentPage.close();
});

// Not built yet: from the proposal and the PR #8 review.
test.fixme("proctor scans the student's QR / check-in code", async () => {});
test.fixme("after check-in the proctor sees the room map with the student's seat", async () => {});
test.fixme("a student in the wrong room is flagged at check-in", async () => {});
test.fixme("proctor moves a student to another seat by hand", async () => {});
test.fixme("dashboard shows checked in / assigned / capacity for every room", async () => {});
test.fixme("proctors only see exams for courses they were invited to", async () => {});
