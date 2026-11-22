/**
 * Creating exams and generating seats, including the seating rules.
 */
import { test } from "@playwright/test";
import {
  api, choose, createCourse, createExam, createRoom, expect, generateSeats, openAs, setNeeds, signupViaApi, uid, uploadRoster,
} from "./helpers";

test("instructor creates an exam across two rooms and generates seats", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const students = [await signupViaApi("STUDENT"), await signupViaApi("STUDENT")];
  const course = await createCourse(instructor);
  await uploadRoster(instructor, course.id, students);
  const roomA = await createRoom(instructor, 1, 1);
  const roomB = await createRoom(instructor, 1, 1);

  await openAs(page, instructor, "/instructor");
  await page.getByText("Exams", { exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/exams$/);
  const title = `Midterm ${uid()}`;
  await page.getByLabel("Exam title").fill(title);
  await choose(page, "Course", new RegExp(course.code));
  await choose(page, "Rooms", roomA.name);
  await choose(page, "Rooms", roomB.name);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create exam" }).click();

  const row = page.locator("div").filter({ hasText: title }).filter({ has: page.getByRole("button", { name: "Generate seats" }) }).last();
  await expect(row).toContainText(`${course.code} / ${roomA.name}, ${roomB.name}`);

  const dialog = page.waitForEvent("dialog");
  await row.getByRole("button", { name: "Generate seats" }).click();
  const d = await dialog;
  expect(d.message()).toBe("Assignments generated!");
  await d.accept();

  // Generating again is refused instead of reshuffling everyone.
  await row.getByRole("button", { name: "Generate seats" }).click();
  await expect(page.getByRole("alert")).toContainText("Assignments already generated");
});

test("create exam is disabled until a room is picked", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  await openAs(page, instructor, "/instructor/exams");
  await page.getByLabel("Exam title").fill("No rooms");
  await expect(page.getByRole("button", { name: "Create exam" })).toBeDisabled();
});

test("generating with more students than seats shows an error", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const course = await createCourse(instructor);
  await uploadRoster(instructor, course.id, [await signupViaApi("STUDENT"), await signupViaApi("STUDENT")]);
  const room = await createRoom(instructor, 1, 1);
  const exam = await createExam(instructor, course.id, [room.id]);
  await openAs(page, instructor, "/instructor/exams");
  const row = page.locator("div").filter({ hasText: exam.title }).filter({ has: page.getByRole("button", { name: "Generate seats" }) }).last();
  await row.getByRole("button", { name: "Generate seats" }).click();
  await expect(page.getByRole("alert")).toContainText("Not enough seats: 2 students, 1 usable seats");
});

test("seating honours accessible and left-handed needs and skips broken seats", async () => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const wheelchair = await signupViaApi("STUDENT", "Wheel Chair");
  const lefty = await signupViaApi("STUDENT", "Lefty Writer");
  const others = [await signupViaApi("STUDENT"), await signupViaApi("STUDENT")];
  await setNeeds(wheelchair, { needsAccessible: true });
  await setNeeds(lefty, { needsLeftHanded: true });
  const course = await createCourse(instructor);
  await uploadRoster(instructor, course.id, [wheelchair, lefty, ...others]);
  // 2 x 3 room: one accessible, one left-handed, one broken, three normal.
  const room = await createRoom(instructor, 2, 3, [
    { row: 0, col: 0, seatType: "ACCESSIBLE" },
    { row: 0, col: 1, seatType: "LEFT_HANDED" },
    { row: 1, col: 2, seatType: "BROKEN" },
  ]);
  const exam = await createExam(instructor, course.id, [room.id]);

  // Seating is random, so run it on several exams to be sure it isn't luck.
  for (let i = 0; i < 5; i++) {
    const e = i === 0 ? exam : await createExam(instructor, course.id, [room.id]);
    const assignments = await generateSeats(instructor, e.id);
    const seatOf = (email: string) => room.seats.find((s) => s.id === assignments.find((a) => a.rosterEntry.email === email)!.seatId)!;
    expect(assignments).toHaveLength(4);
    expect(seatOf(wheelchair.email).seatType).toBe("ACCESSIBLE");
    expect(seatOf(lefty.email).seatType).toBe("LEFT_HANDED");
    const broken = room.seats.find((s) => s.seatType === "BROKEN")!;
    expect(assignments.map((a) => a.seatId)).not.toContain(broken.id);
    expect(new Set(assignments.map((a) => a.seatId)).size).toBe(4); // nobody shares a seat
  }
});

test("a student signed up after the roster upload still gets their needs honoured", async () => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const course = await createCourse(instructor);
  const late = await signupViaApi("STUDENT", "Late Joiner");
  await uploadRoster(instructor, course.id, [late, await signupViaApi("STUDENT")]);
  await setNeeds(late, { needsAccessible: true }); // set after being added to the roster
  const room = await createRoom(instructor, 1, 3, [{ row: 0, col: 2, seatType: "ACCESSIBLE" }]);
  const exam = await createExam(instructor, course.id, [room.id]);
  const assignments = await generateSeats(instructor, exam.id);
  const seatId = assignments.find((a) => a.rosterEntry.email === late.email)!.seatId;
  expect(room.seats.find((s) => s.id === seatId)!.seatType).toBe("ACCESSIBLE");
});

test("students and proctors can't create exams or generate seats", async () => {
  for (const role of ["STUDENT", "PROCTOR"] as const) {
    const user = await signupViaApi(role);
    const ctx = await api(user);
    expect((await ctx.post("/exams", { data: { courseId: "x", roomIds: ["y"], title: "nope" } })).status()).toBe(403);
    expect((await ctx.post("/exams/x/generate")).status()).toBe(403);
    await ctx.dispose();
  }
});

// Not built yet: from the proposal and the PR #8 review.
test.fixme("staff can regenerate seating and keep each student's check-in code", async () => {});
test.fixme("exam has a date/time and duration students can see", async () => {});
