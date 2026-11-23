/**
 * Rooms and seat maps. Rooms are shared across courses, rows can differ in
 * length, and only teaching staff can draw or edit them.
 */
import { test } from "@playwright/test";
import { createExam, createRoom, expect, generate, instructor, join, openAs, register, seedOffering, seedStudents, uid } from "./helpers";

test("instructor draws a room with rows of different lengths", async ({ page }) => {
  const prof = await instructor();
  await openAs(page, prof, "/dashboard");
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  const name = `BA ${uid()}`;
  await page.getByLabel("Room name").fill(name);
  await page.getByLabel("Building").fill("Bahen");
  await page.getByLabel(/Seats per row/).fill("3, 5, 4");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("heading", { name: `${name} · Bahen` })).toBeVisible();
  await expect(page.getByText("12 usable seats")).toBeVisible();
  await expect(page.getByRole("button", { name: "A3", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "B5", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "A4", exact: true })).toHaveCount(0);
});

test("seat markings toggle on and off and are saved; broken seats don't count", async ({ page }) => {
  const prof = await instructor();
  const room = await createRoom(prof, [3, 3]);
  await openAs(page, prof, `/rooms/${room.id}`);
  await expect(page.getByText("6 usable seats")).toBeVisible();

  await page.getByRole("button", { name: "A1", exact: true }).click(); // accessible is the default marking
  await expect(page.getByRole("button", { name: "A1 (accessible)" })).toBeVisible();
  await page.getByText("Left-handed", { exact: true }).first().click();
  await page.getByRole("button", { name: "A2", exact: true }).click();
  await expect(page.getByRole("button", { name: "A2 (left-handed)" })).toBeVisible();
  await page.getByText("Broken", { exact: true }).first().click();
  await page.getByRole("button", { name: "B3", exact: true }).click();
  // Wait for the save before reloading, or the reload cancels it.
  await expect(page.getByRole("button", { name: "B3 (broken)" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "A1 (accessible)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "A2 (left-handed)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "B3 (broken)" })).toBeVisible();
  await expect(page.getByText("5 usable seats")).toBeVisible();

  // Clicking again with the same marking turns it off.
  await page.getByText("Broken", { exact: true }).first().click();
  await page.getByRole("button", { name: "B3 (broken)" }).click();
  await expect(page.getByRole("button", { name: "B3", exact: true })).toBeVisible();
});

test("the layout can be changed until students are seated in the room", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const room = await createRoom(prof, [2, 2]);
  await openAs(page, prof, `/rooms/${room.id}`);
  await page.getByLabel("Seats per row").fill("4, 4, 4");
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByText("12 usable seats")).toBeVisible();

  await seedStudents(prof, offering.id, 2);
  const exam = await createExam(prof, offering.id, [room.id]);
  await generate(prof, exam.id);
  await page.getByLabel("Seats per row").fill("2");
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("alert")).toContainText("already seated in this room");
});

test("marking an occupied seat broken warns that students sit there", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const room = await createRoom(prof, [1]);
  await seedStudents(prof, offering.id, 1);
  const exam = await createExam(prof, offering.id, [room.id]);
  await generate(prof, exam.id);
  await openAs(page, prof, `/rooms/${room.id}`);
  await page.getByText("Broken", { exact: true }).first().click();
  await page.getByRole("button", { name: "A1", exact: true }).click();
  await expect(page.getByText(/still use this seat; move those students/)).toBeVisible();
});

test("proctors can draw rooms too", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const proctor = await register();
  await join(prof, offering.id, proctor, "PROCTOR");
  await openAs(page, proctor, "/dashboard");
  await page.getByRole("link", { name: "Rooms", exact: true }).click();
  await page.getByLabel("Room name").fill(`SS ${uid()}`);
  await page.getByLabel(/Seats per row/).fill("2");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText("2 usable seats")).toBeVisible();
});

test("students can't draw rooms", async ({ page }) => {
  const student = await register();
  await openAs(page, student, "/rooms");
  await expect(page.getByRole("link", { name: "Rooms", exact: true })).toHaveCount(0);
  await page.getByLabel("Room name").fill("Nope");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByRole("alert")).toContainText("Only instructors and proctors");
});

test("someone else's room can be viewed but not edited", async ({ page }) => {
  const owner = await instructor();
  const room = await createRoom(owner, [2]);
  const other = await instructor();
  await openAs(page, other, `/rooms/${room.id}`);
  await page.getByRole("button", { name: "A1", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Only the room's creator");
});

test("rooms can be searched by name or building", async ({ page }) => {
  const prof = await instructor();
  const tag = uid();
  const room = await createRoom(prof, [2], `Findme ${tag}`);
  await openAs(page, prof, "/rooms");
  await page.getByLabel("Search rooms").fill(`findme ${tag}`);
  await expect(page.getByRole("link", { name: room.name })).toBeVisible();
});

// In the proposal ("or any other specialty marking"), not built yet.
test.fixme("seats can carry custom markings beyond accessible / left-handed / broken", async () => {});
