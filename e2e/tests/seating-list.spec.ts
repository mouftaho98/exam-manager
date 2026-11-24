/**
 * The seating card's list view: one row per student with number, room, seat
 * and check-in status; searchable, filterable and paginated. "Move" hands a
 * student to the map.
 */
import { test, type Page } from "@playwright/test";
import { expect, openAs, seatingOf, seedExam, showMap } from "./helpers";

const rows = (page: Page) => page.getByTestId("seating-row");

test("the list shows each student's number, room, seat and status", async ({ page }) => {
  const { prof, students, exam, rooms } = await seedExam({ students: 3 });
  const seats = await seatingOf(prof, exam.id);
  await openAs(page, prof, `/exams/${exam.id}`);
  await expect(rows(page)).toHaveCount(3);
  for (const s of students) {
    const row = rows(page).filter({ hasText: s.name });
    await expect(row).toContainText(s.studentNumber);
    await expect(row).toContainText(rooms[0].name);
    await expect(row).toContainText(seats.get(s.memberId)!.label);
    await expect(row).toContainText("Not here yet");
  }
  await expect(page.getByText("1–3 of 3 students")).toBeVisible();
});

test("a checked-in student shows as checked in, and the status filter finds who is missing", async ({ page }) => {
  const { prof, students, exam } = await seedExam({ students: 3 });
  await openAs(page, prof, `/exams/${exam.id}`);
  await page.getByLabel("Student number").fill(students[0].studentNumber);
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  const checkedIn = rows(page).filter({ hasText: students[0].name });
  await expect(checkedIn).toContainText("Checked in");
  // Checked-in rows are highlighted green; the rest aren't.
  await expect(checkedIn).toHaveCSS("background-color", "rgb(235, 251, 238)");
  await expect(rows(page).filter({ hasText: students[1].name })).not.toHaveCSS("background-color", "rgb(235, 251, 238)");

  await page.getByRole("textbox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Not here yet" }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: students[0].name })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Checked in" }).click();
  await expect(rows(page)).toHaveCount(1);
});

test("search narrows the list by name or student number", async ({ page }) => {
  const { prof, students, exam } = await seedExam({ students: 3 });
  await openAs(page, prof, `/exams/${exam.id}`);
  await page.getByLabel("Search").fill(students[1].name);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(students[1].name);
  await page.getByLabel("Search").fill(students[2].studentNumber);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(students[2].name);
  await page.getByLabel("Search").fill("nobody by this name");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("No students match.")).toBeVisible();
});

test("a big class is paginated", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 30, rooms: [[10, 10, 10]] });
  await openAs(page, prof, `/exams/${exam.id}`);
  await expect(rows(page)).toHaveCount(25);
  await expect(page.getByText("1–25 of 30 students")).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText("26–30 of 30 students")).toBeVisible();
});

test("the list and map views switch, and the choice survives a refresh", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 2 });
  await openAs(page, prof, `/exams/${exam.id}`);
  await expect(page.getByTestId("seat-map")).toHaveCount(0);
  await showMap(page);
  await expect(rows(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("seat-map").first()).toBeVisible();
  await page.getByText("List", { exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
});

test("Move in the list opens the map on that student's room and moves them", async ({ page }) => {
  const { prof, students, exam, rooms } = await seedExam({ students: 2, rooms: [[3], [3]] });
  const before = await seatingOf(prof, exam.id);
  const x = students[0];
  const from = before.get(x.memberId)!;
  const taken = new Set([...before.values()].filter((s) => s.roomId === from.roomId).map((s) => s.label));
  const empty = ["A1", "A2", "A3"].find((l) => !taken.has(l))!;
  await openAs(page, prof, `/exams/${exam.id}`);
  await rows(page).filter({ hasText: x.name }).getByRole("button", { name: "Move" }).click();
  await expect(page.getByText(`Moving ${x.name}`)).toBeVisible();
  // The map opens on the room they sit in.
  const room = rooms.find((r) => r.id === from.roomId)!;
  await expect(page.getByRole("tab", { name: room.name })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: `${empty} (empty)` }).click();
  await expect(page.getByRole("button", { name: `${empty}: ${x.name}` })).toBeVisible();
  expect((await seatingOf(prof, exam.id)).get(x.memberId)!.label).toBe(empty);
});

test("proctors get the list too", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 2 });
  await openAs(page, proctor, `/exams/${exam.id}`);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: students[0].name })).toContainText(students[0].studentNumber);
});
