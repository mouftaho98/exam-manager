/**
 * What students see: their exams, room and seat, before exam day.
 */
import { test } from "@playwright/test";
import { call, expect, openAs, seatingOf, seedExam } from "./helpers";

test("the dashboard lists my exam with my room and seat", async ({ page }) => {
  const { prof, students, exam, course } = await seedExam({ students: 2 });
  const me = students[0];
  const seat = (await seatingOf(prof, exam.id)).get(me.memberId)!;
  await openAs(page, me, "/dashboard");
  const card = page.getByTestId("my-exam").filter({ hasText: exam.title });
  await expect(card).toContainText(course.code);
  await expect(card).toContainText(`${seat.roomName}, seat ${seat.label}`);
});

test("the exam page shows my seat highlighted on the room map", async ({ page }) => {
  const { prof, students, exam } = await seedExam({ students: 3 });
  const me = students[1];
  const seat = (await seatingOf(prof, exam.id)).get(me.memberId)!;
  await openAs(page, me, "/dashboard");
  await page.getByRole("link", { name: exam.title }).click();
  await expect(page.getByRole("heading", { name: `${seat.roomName} · ${seat.label}` })).toBeVisible();
  await expect(page.getByText("Not checked in")).toBeVisible();
  await expect(page.getByRole("button", { name: `${seat.label} — your seat` })).toBeVisible();
  await expect(page.getByRole("button", { name: /— your seat/ })).toHaveCount(1);
  await expect(page.getByText("Bring your student ID card")).toBeVisible();
  // Students never get the staff tools.
  await expect(page.getByRole("heading", { name: "Check in" })).toHaveCount(0);
});

test("before seating is generated the student is told to check back", async ({ page }) => {
  const { students, exam } = await seedExam({ students: 1, seat: false });
  await openAs(page, students[0], "/dashboard");
  await expect(page.getByTestId("my-exam").filter({ hasText: exam.title })).toContainText("Seat not assigned yet");
  await openAs(page, students[0], `/exams/${exam.id}`);
  await expect(page.getByText("hasn't been assigned yet")).toBeVisible();
});

test("students only see their own exams, and can't read the seating chart", async ({ page }) => {
  const a = await seedExam({ students: 1 });
  const b = await seedExam({ students: 1 });
  await openAs(page, a.students[0], "/dashboard");
  await expect(page.getByTestId("my-exam").filter({ hasText: a.exam.title })).toBeVisible();
  await expect(page.getByTestId("my-exam").filter({ hasText: b.exam.title })).toHaveCount(0);
  await openAs(page, a.students[0], `/exams/${b.exam.id}`);
  await expect(page.getByRole("alert")).toContainText("not found");
  await expect(call(a.students[0], "get", `/exams/${a.exam.id}/seating`)).rejects.toThrow(/403/);
});

// Stretch goal 1 in the proposal, not built yet.
test.fixme("students get an email when their seat is assigned or changed", async () => {});
