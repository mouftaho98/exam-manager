/**
 * Roster upload: every student on the class list is invited automatically.
 * Rosters carry names and student numbers, never seating needs.
 */
import { test } from "@playwright/test";
import { PASSWORD, call, createExam, createRoom, expect, generate, join, openAs, register, seatingOf, seedOffering, seedStudents, studentNumber, uniqueEmail } from "./helpers";

test("instructor pastes a roster; students are added and get invite links", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "Roster upload" }).click();
  const ana = uniqueEmail("ana");
  const bo = uniqueEmail("bo");
  await page.getByLabel("Roster CSV", { exact: true }).fill(`Email,Student Number,First Name,Last Name\n${ana},${studentNumber()},Ana,Lee\n${bo},${studentNumber()},Bo,Chan\n`);
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText("Added 2 new students, 0 already on the roster.")).toBeVisible();
  await expect(page.getByText(`${ana}: http`)).toBeVisible();

  await page.getByRole("tab", { name: "People" }).click();
  const row = page.getByTestId("member-row").filter({ hasText: ana });
  await expect(row).toContainText("Ana Lee");
  await expect(row).toContainText("Invited");
  await expect(row.getByRole("textbox", { name: `Role for ${ana}` })).toHaveValue("Student");
});

test("uploading from a CSV file works too, and re-uploading doesn't duplicate anyone", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "Roster upload" }).click();
  const email = uniqueEmail("file");
  const csv = `email,student_number\n${email},${studentNumber()}\n`;
  await page.getByLabel("Roster CSV file").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByLabel("Roster CSV", { exact: true })).toHaveValue(new RegExp(email));
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText("Added 1 new student, 0 already on the roster.")).toBeVisible();

  await page.getByLabel("Roster CSV", { exact: true }).fill(csv);
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText("Added 0 new students, 1 already on the roster.")).toBeVisible();
});

test("bad rows are skipped and reported by line number", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "Roster upload" }).click();
  await page.getByLabel("Roster CSV", { exact: true }).fill(`email,student_number\n${uniqueEmail("ok")},${studentNumber()}\nnot-an-email,123\n`);
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText(/Added 1 new student.*1 row skipped/)).toBeVisible();
  await expect(page.getByText(/^Line 3:/)).toBeVisible();
});

test("a roster without an email column says what's wrong", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "Roster upload" }).click();
  await page.getByLabel("Roster CSV", { exact: true }).fill("name,number\nAna,1\n");
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText("Line 1: CSV needs an 'email' column in the header row")).toBeVisible();
});

test("a student on the roster signs up with that email and joins with their invite", async ({ page }) => {
  const { prof, offering, course } = await seedOffering();
  const email = uniqueEmail("rostered");
  const res = await call(prof, "post", `/offerings/${offering.id}/roster`, `email,student_number,first_name,last_name\n${email},${studentNumber()},Ros,Ter`, { "Content-Type": "text/csv" });
  await page.goto(new URL(res.invites[0].inviteUrl).pathname);
  await expect(page.getByText(`Join ${course.code}`)).toContainText("as a student");
  await page.getByRole("button", { name: "Sign up to accept" }).click();
  await page.getByLabel("First name").fill("Ros");
  await page.getByLabel("Last name").fill("Ter");
  await page.getByLabel(/Password/).fill(PASSWORD);
  await page.getByText("I need an accessible seat").click();
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.getByRole("button", { name: "Accept invite" }).click();
  await expect(page.getByText("You're a student")).toBeVisible();

  // The instructor sees them joined, with the needs the student set themselves.
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const row = page.getByTestId("member-row").filter({ hasText: email });
  await expect(row).not.toContainText("Invited");
  await expect(page.getByLabel(`Accessible seat for ${email}`)).toBeChecked();
  await expect(page.getByLabel(`Left-handed desk for ${email}`)).not.toBeChecked();
});

test("someone already in the offering as staff is not added as a student", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const proctor = await register();
  await call(prof, "post", `/offerings/${offering.id}/members`, { email: proctor.email, role: "PROCTOR" });
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "Roster upload" }).click();
  await page.getByLabel("Roster CSV", { exact: true }).fill(`email\n${proctor.email}\n`);
  await page.getByRole("button", { name: "Upload roster" }).click();
  await expect(page.getByText(/already in this offering as proctor/)).toBeVisible();
});

test("seating-need columns in a roster are ignored; only the student sets those", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const email = uniqueEmail("needs");
  await call(prof, "post", `/offerings/${offering.id}/roster`, `email,needsAccessible,leftHanded\n${email},true,true`, { "Content-Type": "text/csv" });
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const row = page.getByTestId("member-row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await expect(page.getByLabel(`Accessible seat for ${email}`)).not.toBeChecked();
  await expect(page.getByLabel(`Left-handed desk for ${email}`)).not.toBeChecked();
});

test("an instructor sets a student's seating needs when the student asks, and the seating uses them", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const [student] = await seedStudents(prof, offering.id, 1);
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const leftHanded = page.getByLabel(`Left-handed desk for ${student.email}`);
  await expect(leftHanded).not.toBeChecked();
  await page.getByTestId("member-row").filter({ hasText: student.email }).getByText("Left-handed").click();
  await expect(leftHanded).toBeChecked(); // saved (the list reloads from the API)
  await page.reload();
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByLabel(`Left-handed desk for ${student.email}`)).toBeChecked();

  // The student sees it on their own dashboard, and seating honours it.
  await openAs(page, student, "/dashboard");
  await expect(page.getByLabel("I'm left-handed")).toBeChecked();
  const room = await createRoom(prof, [[{ col: 0 }, { col: 1 }, { col: 2, leftHanded: true }]]);
  const exam = await createExam(prof, offering.id, [room.id]);
  await generate(prof, exam.id);
  expect((await seatingOf(prof, exam.id)).get(student.memberId)!.leftHanded).toBe(true);
});

test("proctors see students' needs but can't change them", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const [student] = await seedStudents(prof, offering.id, 1, [{ needsAccessible: true }]);
  const proctor = await register();
  await join(prof, offering.id, proctor, "PROCTOR");
  await openAs(page, proctor, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const row = page.getByTestId("member-row").filter({ hasText: student.email });
  await expect(row).toContainText("Accessible");
  await expect(page.getByLabel(`Accessible seat for ${student.email}`)).toHaveCount(0);
});
