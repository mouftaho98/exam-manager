/**
 * Rooms and their seat maps.
 */
import { test } from "@playwright/test";
import { createRoom, expect, openAs, signupViaApi, uid } from "./helpers";

test("instructor creates a room and sees its seat count", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  await openAs(page, instructor, "/instructor");
  await page.getByText("Rooms", { exact: true }).click();
  await expect(page).toHaveURL(/\/instructor\/rooms$/);

  const name = `BA${uid()}`;
  await page.getByLabel("Room name").fill(name);
  await page.getByLabel("Rows").fill("3");
  await page.getByLabel("Cols").fill("4");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByText(`${name} (12 seats)`)).toBeVisible();
});

test("clicking a seat cycles normal → accessible → left-handed → broken, and it's saved", async ({ page }) => {
  const instructor = await signupViaApi("INSTRUCTOR");
  const room = await createRoom(instructor, 2, 3);
  await openAs(page, instructor, "/instructor/rooms");
  await page.getByRole("button", { name: "View/Edit seats" }).click();
  await expect(page.getByRole("heading", { name: `Seats: ${room.name}` })).toBeVisible();

  const seat = page.getByRole("button", { name: "A1", exact: true });
  await expect(seat).toHaveAttribute("title", "A1 (NORMAL)");
  for (const type of ["ACCESSIBLE", "LEFT_HANDED", "BROKEN"]) {
    await seat.click();
    await expect(seat).toHaveAttribute("title", `A1 (${type})`);
  }

  await page.reload();
  await page.getByRole("button", { name: "View/Edit seats" }).click();
  await expect(page.getByRole("button", { name: "A1", exact: true })).toHaveAttribute("title", "A1 (BROKEN)");
  await expect(page.getByRole("button", { name: "B3", exact: true })).toHaveAttribute("title", "B3 (NORMAL)");
});

test("proctors can't open the rooms page data", async ({ page }) => {
  const proctor = await signupViaApi("PROCTOR");
  await openAs(page, proctor, "/instructor/rooms");
  await expect(page.getByRole("alert")).toBeVisible();
});

// Not built yet: from the proposal.
test.fixme("rows can have different numbers of seats (non-rectangular rooms)", async () => {});
test.fixme("seats can carry custom markings beyond accessible / left-handed / broken", async () => {});
