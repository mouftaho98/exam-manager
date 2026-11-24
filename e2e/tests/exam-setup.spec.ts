/**
 * Exam setup is its own page (instructors only): details, rooms, seating and
 * clearing the seating. Exam day (check-in, attendance) is the exam page.
 */
import { test } from "@playwright/test";
import { call, createRoom, expect, openAs, seatingOf, seedExam, seedOffering, createExam, seedStudents } from "./helpers";

test("setup and exam day are separate pages", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 2 });
  await openAs(page, prof, `/exams/${exam.id}`);
  // Exam day: check-in and attendance, no setup controls.
  await expect(page.getByRole("heading", { name: "Check in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate seating" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save rooms" })).toHaveCount(0);
  await page.getByRole("link", { name: "Exam setup" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${exam.id}/setup$`));
  // Setup: rooms and seating, no check-in.
  await expect(page.getByRole("button", { name: "Regenerate seating" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check in" })).toHaveCount(0);
  await page.getByRole("link", { name: /Back to the exam/ }).click();
  await expect(page.getByRole("heading", { name: "Check in" })).toBeVisible();
});

test("only instructors get the setup page; proctors don't see the link", async ({ page }) => {
  const { proctor, exam } = await seedExam({ students: 1 });
  await openAs(page, proctor, `/exams/${exam.id}`);
  await expect(page.getByRole("heading", { name: "Check in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Exam setup" })).toHaveCount(0);
  await page.goto(`/exams/${exam.id}/setup`);
  await expect(page.getByText("Only instructors can set up an exam.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate seating" })).toHaveCount(0);
});

test("the exam page says when seating isn't set up yet, and links instructors to setup", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 2, seat: false });
  await openAs(page, prof, `/exams/${exam.id}`);
  await expect(page.getByText("Seating isn't set up yet")).toBeVisible();
  await page.getByRole("link", { name: "exam setup page" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${exam.id}/setup$`));
});

test("the exams list links instructors to each exam's setup", async ({ page }) => {
  const { prof, offering, exam } = await seedExam({ students: 1 });
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByTestId("exam-row").getByRole("link", { name: "Set up" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${exam.id}/setup$`));
});

test("an instructor edits the exam's title and duration", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 1 });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await page.getByLabel("Exam title").fill("Renamed midterm");
  await page.getByLabel("Duration (minutes)").fill("90");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Exam title")).toHaveValue("Renamed midterm");
  await expect(page.getByLabel("Duration (minutes)")).toHaveValue("90");
});

test("clearing the seating un-seats everyone, so the rooms can be switched and seating generated again", async ({ page }) => {
  const { prof, exam, students, rooms } = await seedExam({ students: 3, rooms: [[3], [3]] });
  const oldRoomId = [...(await seatingOf(prof, exam.id)).values()][0].roomId;
  const newRoom = rooms.find((r) => r.id !== oldRoomId)!;
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await expect(page.getByText("3 of 3 students seated")).toBeVisible();

  // Before clearing, the room everyone sits in can't be dropped.
  const blocked = await call(prof, "put", `/exams/${exam.id}/rooms`, { roomIds: [] }).then(() => false, () => true);
  expect(blocked).toBe(true);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Clear all seating" }).click();
  await expect(page.getByText("Cleared 3 seats.")).toBeVisible();
  await expect(page.getByText("0 of 3 students seated")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear all seating" })).toBeDisabled();
  expect((await seatingOf(prof, exam.id)).size).toBe(0);

  // Switch rooms: with nobody seated, the old room can be dropped.
  await call(prof, "put", `/exams/${exam.id}/rooms`, { roomIds: [newRoom.id] });
  await page.reload();
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expect(page.getByText("Seated 3 students.")).toBeVisible();
  const after = [...(await seatingOf(prof, exam.id)).values()];
  expect(after).toHaveLength(3);
  expect(after.every((s) => s.roomId === newRoom.id)).toBe(true);
  void students;
});

test("clearing after check-in starts warns, and removes the check-ins too", async ({ page }) => {
  const { prof, proctor, exam, students } = await seedExam({ students: 2 });
  await call(proctor, "post", `/exams/${exam.id}/checkins`, { studentNumber: students[0].studentNumber, roomId: [...(await seatingOf(prof, exam.id)).values()][0].roomId });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await expect(page.getByText("1 checked in")).toBeVisible();
  let message = "";
  page.once("dialog", (d) => { message = d.message(); void d.accept(); });
  await page.getByRole("button", { name: "Clear all seating" }).click();
  await expect(page.getByText(/Cleared 2 seats and 1 check-in\./)).toBeVisible();
  expect(message).toContain("1 student has already checked in");
  await expect(page.getByText("0 of 2 students seated")).toBeVisible();
  await page.getByRole("link", { name: /Back to the exam/ }).click();
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 0 · Missing 0");
});

test("cancelling the confirmation keeps the seating", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 2 });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Clear all seating" }).click();
  await expect(page.getByText("2 of 2 students seated")).toBeVisible();
  expect((await seatingOf(prof, exam.id)).size).toBe(2);
});

test("an exam with no seating yet can't be cleared", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await seedStudents(prof, offering.id, 1);
  const room = await createRoom(prof, [2]);
  const exam = await createExam(prof, offering.id, [room.id]);
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await expect(page.getByRole("button", { name: "Clear all seating" })).toBeDisabled();
});
