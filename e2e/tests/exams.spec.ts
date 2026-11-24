/**
 * Exams and seat generation: spacing students out, honouring accessible and
 * left-handed needs, skipping broken seats, and never crashing when a room
 * has no special seats.
 */
import { test } from "@playwright/test";
import { call, choose, createExam, createRoom, expect, generate, join, openAs, register, seatingOf, seedExam, seedOffering, seedStudents, showMap, uid } from "./helpers";

test("instructor creates an exam with a date, duration and two rooms", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const a = await createRoom(prof, [2]);
  const b = await createRoom(prof, [2]);
  await openAs(page, prof, `/offerings/${offering.id}`);
  const title = `Midterm ${uid()}`;
  await page.getByLabel("Exam title").fill(title);
  await page.getByLabel("Starts at").fill("2026-12-10T09:30");
  await page.getByLabel("Duration (minutes)").fill("90");
  await choose(page, "Rooms", new RegExp(a.name));
  await choose(page, "Rooms", new RegExp(b.name));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create exam" }).click();
  const row = page.getByTestId("exam-row").filter({ hasText: title });
  await expect(row).toContainText("90 min");
  await expect(row).toContainText(`${a.name}, ${b.name}`);
  await expect(row).toContainText("No seating yet");
});

test("instructor generates seating and sees everyone seated", async ({ page }) => {
  const { prof, exam, students } = await seedExam({ students: 4, seat: false });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expect(page.getByText("Seated 4 students.")).toBeVisible();
  await expect(page.getByText("4 of 4 students seated")).toBeVisible();
  await page.getByRole("link", { name: /Back to the exam/ }).click();
  await expect(page.getByTestId("attendance-totals")).toHaveText("Checked in 0 / 4 · Missing 4");
  // Every student appears in the seating list, and on the map.
  for (const s of students) await expect(page.getByTestId("seating-row").filter({ hasText: s.name })).toHaveCount(1);
  await showMap(page);
  for (const s of students) await expect(page.getByRole("button", { name: new RegExp(`: ${s.name}`) })).toBeVisible();
});

test("regenerating asks first and keeps everyone seated", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 3 });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Regenerate seating" }).click();
  await expect(page.getByText("Seated 3 students.")).toBeVisible();
});

test("students who don't fit are listed, and can be seated by hand later", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 3, rooms: [[2]], seat: false });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expect(page.getByText(/Seated 2 students\. 1 didn't fit/)).toBeVisible();
  await page.getByRole("link", { name: /Back to the exam/ }).click();
  await expect(page.getByTestId("seating-row").filter({ hasText: "No seat" })).toHaveCount(1);
  await showMap(page);
  await expect(page.getByText("Without a seat")).toBeVisible();
});

test("rooms are added to an exam later, then seating is generated", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await seedStudents(prof, offering.id, 2);
  const exam = await createExam(prof, offering.id, []);
  const room = await createRoom(prof, [4]);
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await expect(page.getByRole("button", { name: "Generate seating" })).toBeDisabled();
  await choose(page, "Rooms", new RegExp(room.name));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save rooms" }).click();
  await expect(page.getByRole("button", { name: "Save rooms" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Generate seating" })).toBeEnabled();
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expect(page.getByText("Seated 2 students.")).toBeVisible();
});

test("accessible and left-handed students get matching seats; broken seats are never used", async () => {
  const { prof, offering } = await seedOffering();
  const [wheelchair, lefty, ...others] = await seedStudents(prof, offering.id, 5, [{ needsAccessible: true }, { leftHanded: true }]);
  const room = await createRoom(prof, [
    [{ col: 0, accessible: true }, { col: 1, leftHanded: true }, { col: 2 }, { col: 3 }],
    [{ col: 0 }, { col: 1 }, { col: 2, broken: true }, { col: 3 }],
  ]);
  const exam = await createExam(prof, offering.id, [room.id]);
  const broken = room.rows[1].seats[2].id;
  // Seating is random, so try several seeds.
  for (const seed of [1, 2, 3, 4, 5]) {
    await generate(prof, exam.id, seed);
    const seats = await seatingOf(prof, exam.id);
    expect(seats.get(wheelchair.memberId)!.accessible).toBe(true);
    expect(seats.get(lefty.memberId)!.leftHanded).toBe(true);
    expect([...seats.values()].map((s) => s.seatId)).not.toContain(broken);
    expect(new Set([...seats.values()].map((s) => s.seatId)).size).toBe(2 + others.length);
  }
});

test("a room with no accessible or left-handed seats still seats everyone, with a warning", async ({ page }) => {
  const { prof, exam } = await seedExam({ students: 2, rooms: [[3]], needs: [{ needsAccessible: true }, { leftHanded: true }], seat: false });
  await openAs(page, prof, `/exams/${exam.id}/setup`);
  await page.getByRole("button", { name: "Generate seating" }).click();
  await expect(page.getByText("Seated 2 students.")).toBeVisible();
  await expect(page.getByText(/accessible/i).last()).toBeVisible();
});

test("students are spread out when there's room", async () => {
  // 3 students in a 3x3 room: nobody should sit next to anybody.
  const { prof, exam, rooms } = await seedExam({ students: 3, rooms: [[3, 3, 3]], seat: false });
  await generate(prof, exam.id, 7);
  const seats = [...(await seatingOf(prof, exam.id)).values()];
  const pos = new Map(rooms[0].rows.flatMap((r) => r.seats.map((s, col) => [s.id, { row: r.row, col }] as const)));
  for (const a of seats) for (const b of seats) {
    if (a === b) continue;
    const p = pos.get(a.seatId)!, q = pos.get(b.seatId)!;
    expect(Math.abs(p.row - q.row) + Math.abs(p.col - q.col)).toBeGreaterThan(1);
  }
});

test("proctors see exam day tools but not exam setup", async ({ page }) => {
  const { proctor, exam } = await seedExam({ students: 1 });
  await openAs(page, proctor, `/exams/${exam.id}`);
  await expect(page.getByRole("heading", { name: "Check in" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Setup" })).toHaveCount(0);
  await expect(call(proctor, "post", `/exams/${exam.id}/seating/generate`, {})).rejects.toThrow(/403/);
});

test("only instructors can create exams", async () => {
  const { prof, offering } = await seedOffering();
  const proctor = await register();
  await join(prof, offering.id, proctor, "PROCTOR");
  await expect(call(proctor, "post", `/offerings/${offering.id}/exams`, { title: "x", startsAt: new Date().toISOString(), durationMinutes: 60 })).rejects.toThrow(/403/);
});
