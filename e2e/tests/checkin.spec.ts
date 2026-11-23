/**
 * Exam day: proctors check students in with their student ID card, see
 * where they sit, and watch every room fill up live. Staff can move seats.
 */
import { test, type Page } from "@playwright/test";
import { choose, expect, instructor, join, openAs, register, seatingOf, seedExam } from "./helpers";

/** Open the exam as staff and wait for the live connection. */
async function openExamDay(page: Page, user: { token: string }, examId: string) {
  await openAs(page, user, `/exams/${examId}`);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
}

async function checkInNumber(page: Page, number: string) {
  await page.getByLabel("Student number").fill(number);
  await page.getByRole("button", { name: "Check in", exact: true }).click();
}

test("proctor types the student number from the ID card and sees the seat", async ({ page }) => {
  const { prof, proctor, students, exam } = await seedExam({ students: 3 });
  const s = students[0];
  const seat = (await seatingOf(prof, exam.id)).get(s.memberId)!;
  await openExamDay(page, proctor, exam.id);
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 3 · Missing 3");

  await checkInNumber(page, s.studentNumber);
  await expect(page.getByRole("alert").filter({ hasText: "Checked in" })).toContainText(`${s.name} → seat ${seat.label}`);
  // The room map shows where to send them.
  await expect(page.getByRole("button", { name: `${seat.label} — ${s.name}` })).toBeVisible();
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 3 · Missing 2");
  await expect(page.getByLabel("Student number")).toHaveValue("");
});

test("pressing Enter after a scan checks the student in (how card readers type)", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 1 });
  await openExamDay(page, proctor, exam.id);
  await page.getByLabel("Student number").fill(students[0].studentNumber);
  await page.getByLabel("Student number").press("Enter");
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 1 · Missing 0");
});

test("scanning the same card twice doesn't double count", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 2 });
  await openExamDay(page, proctor, exam.id);
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 2 · Missing 1");
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByRole("alert").filter({ hasText: "Already checked in" })).toBeVisible();
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 2 · Missing 1");
});

test("a student at the wrong room is sent to the right one", async ({ page }) => {
  // Two rooms of one seat each, so the two students are in different rooms.
  const { prof, proctor, students, exam, rooms } = await seedExam({ students: 2, rooms: [[1], [1]] });
  const seats = await seatingOf(prof, exam.id);
  const s = students.find((x) => seats.get(x.memberId)!.roomId === rooms[1].id)!;
  await openExamDay(page, proctor, exam.id);
  await choose(page, "I'm checking students into", rooms[0].name);
  await checkInNumber(page, s.studentNumber);
  await expect(page.getByRole("alert").filter({ hasText: "Wrong room" })).toContainText(`Send them to ${rooms[1].name}`);
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 2 · Missing 2");
});

test("an unknown student number shows an error", async ({ page }) => {
  const { proctor, exam } = await seedExam({ students: 1 });
  await openExamDay(page, proctor, exam.id);
  await checkInNumber(page, "000000000");
  await expect(page.getByRole("alert")).toContainText("No student in this exam has that student number");
});

test("with more than one room the proctor must pick theirs first", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 2, rooms: [[1], [1]] });
  await openExamDay(page, proctor, exam.id);
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByRole("alert")).toContainText("Pick the room");
});

test("a student without their card is found by name", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 3 });
  await openExamDay(page, proctor, exam.id);
  await choose(page, "No card? Find them by name", new RegExp(students[2].email), students[2].firstName);
  await page.getByRole("button", { name: "Check in by name" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Checked in" })).toContainText(students[2].name);
});

test("a check-in on one proctor's phone shows up live on another's", async ({ browser }) => {
  const { prof, proctor, students, exam, offering } = await seedExam({ students: 2 });
  const second = await register();
  await join(prof, offering.id, second, "PROCTOR");
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await openExamDay(a, proctor, exam.id);
  await openExamDay(b, second, exam.id);
  await expect(b.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 2 · Missing 2");
  await checkInNumber(a, students[0].studentNumber);
  // No reload on B: the update arrives over Socket.IO.
  await expect(b.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 2 · Missing 1");
  await expect(b.getByRole("button", { name: new RegExp(`${students[0].name} \\(checked in\\)`) })).toBeVisible();
});

test("attendance shows each room's checked in / seated / capacity, and who's missing", async ({ page }) => {
  const { prof, proctor, students, exam, rooms } = await seedExam({ students: 3, rooms: [[2], [2]] });
  const seats = await seatingOf(prof, exam.id);
  await openExamDay(page, proctor, exam.id);
  const first = students[0];
  const room = rooms.find((r) => r.id === seats.get(first.memberId)!.roomId)!;
  await choose(page, "I'm checking students into", room.name);
  await checkInNumber(page, first.studentNumber);
  const row = page.getByTestId("attendance-room").filter({ hasText: room.name });
  const seatedHere = [...seats.values()].filter((s) => s.roomId === room.id).length;
  await expect(row).toHaveText(new RegExp(`${room.name}1${seatedHere}2`));
  await expect(page.getByTestId("missing-student")).toHaveCount(2);
  await expect(page.getByTestId("missing-student").filter({ hasText: first.name })).toHaveCount(0);
});

test("a check-in can be undone from the seating map", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 1 });
  await openExamDay(page, proctor, exam.id);
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 1 · Missing 0");
  await page.getByRole("button", { name: new RegExp(`${students[0].name} \\(checked in\\)`) }).click();
  await page.getByRole("button", { name: "Undo check-in" }).click();
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 1 · Missing 1");
});

for (const who of ["proctor", "instructor"] as const) {
  test(`${who === "instructor" ? "an" : "a"} ${who} moves a student to an empty seat, and swaps two students`, async ({ page }) => {
    const ctx = await seedExam({ students: 2, rooms: [[3]] });
    const user = who === "proctor" ? ctx.proctor : ctx.prof;
    const [x, y] = ctx.students;
    const before = await seatingOf(ctx.prof, ctx.exam.id);
    const taken = new Set([...before.values()].map((s) => s.label));
    const empty = ["A1", "A2", "A3"].find((l) => !taken.has(l))!;
    await openExamDay(page, user, ctx.exam.id);

    await page.getByRole("button", { name: new RegExp(`: ${x.name}$`) }).click();
    await expect(page.getByText(`Moving ${x.name}`)).toBeVisible();
    await page.getByRole("button", { name: `${empty} (empty)` }).click();
    await expect(page.getByRole("button", { name: `${empty}: ${x.name}` })).toBeVisible();
    expect((await seatingOf(ctx.prof, ctx.exam.id)).get(x.memberId)!.label).toBe(empty);

    const yLabel = before.get(y.memberId)!.label;
    await page.getByRole("button", { name: `${empty}: ${x.name}` }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `${yLabel}: ${y.name}` }).click();
    await expect(page.getByRole("button", { name: `${yLabel}: ${x.name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `${empty}: ${y.name}` })).toBeVisible();
  });
}

test("the student sees they're checked in", async ({ page }) => {
  const { proctor, students, exam } = await seedExam({ students: 1 });
  await openExamDay(page, proctor, exam.id);
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 1 / 1 · Missing 0");
  await openAs(page, students[0], `/exams/${exam.id}`);
  await expect(page.getByText("Checked in", { exact: true })).toBeVisible();
});

test("seating can't be regenerated once check-in has started", async ({ page }) => {
  const { prof, students, exam } = await seedExam({ students: 2 });
  await openExamDay(page, prof, exam.id);
  await checkInNumber(page, students[0].studentNumber);
  await expect(page.getByRole("button", { name: "Regenerate seating" })).toBeDisabled();
  await expect(page.getByText("Check-in has started")).toBeVisible();
});

test("staff of another course can't check students into this exam", async ({ page }) => {
  const { exam } = await seedExam({ students: 1 });
  const outsider = await instructor();
  await openAs(page, outsider, `/exams/${exam.id}`);
  await expect(page.getByRole("alert")).toContainText("not found");
});
