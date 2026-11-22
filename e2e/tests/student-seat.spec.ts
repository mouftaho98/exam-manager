/**
 * Students look up their exam, room and seat ahead of time.
 */
import { test } from "@playwright/test";
import { choose, expect, openAs, seedExam } from "./helpers";

test("student sees their room, seat and a map with their seat highlighted", async ({ page }) => {
  const { students, exam, room, course, assignments } = await seedExam({ students: 2 });
  const me = students[0];
  const mySeat = room.seats.find((s) => s.id === assignments.find((a) => a.rosterEntry.email === me.email)!.seatId)!;

  await openAs(page, me, "/student");
  await choose(page, "Your exams", new RegExp(exam.title));
  await expect(page.getByText(`Course: ${course.name}`)).toBeVisible();
  await expect(page.getByText(`Room: ${room.name}`)).toBeVisible();
  await expect(page.getByText(`Seat: ${mySeat.label} (${mySeat.seatType})`)).toBeVisible();
  await expect(page.getByText("Checked in: No")).toBeVisible();
  await expect(page.getByText("Room map (your seat highlighted)")).toBeVisible();
  await expect(page.getByTitle(`${mySeat.label} (${mySeat.seatType}) — YOUR SEAT`)).toBeVisible();
  // Only one seat is marked as theirs.
  await expect(page.locator('[title$="YOUR SEAT"]')).toHaveCount(1);
});

test("a student only sees exams they're on the roster for", async ({ page }) => {
  const a = await seedExam({ students: 1 });
  const b = await seedExam({ students: 1 });
  await openAs(page, a.students[0], "/student");
  await page.getByRole("textbox", { name: "Your exams" }).click();
  await expect(page.getByRole("option", { name: new RegExp(a.exam.title) })).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(b.exam.title) })).toHaveCount(0);
});

// Not built yet: from the proposal ("check in with a QR code or personal code").
test.fixme("student sees a QR code / check-in code for each exam", async () => {});
test.fixme("student is notified (email) when their seat is assigned or changed", async () => {});
