/**
 * Instructors invite proctors, co-instructors and students. People join with
 * the invite link.
 */
import { test } from "@playwright/test";
import { PASSWORD, call, choose, expect, instructor, join, openAs, register, seedOffering, tokenFrom, uniqueEmail } from "./helpers";

test("instructor invites a proctor who signs up from the link and joins", async ({ page, browser }) => {
  const { prof, offering, course } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const email = uniqueEmail("proctor");
  await page.getByLabel("Email").fill(email);
  await choose(page, "As", "Proctor");
  await page.getByRole("button", { name: "Invite" }).click();
  const link = await page.getByTestId("invite-link").innerText();
  await expect(page.getByTestId("member-row").filter({ hasText: email })).toContainText("Invited");

  // The proctor opens the link in their own browser and signs up.
  const p = await (await browser.newContext()).newPage();
  await p.goto(new URL(link).pathname);
  await expect(p.getByText(`Join ${course.code}`)).toContainText("as a proctor");
  await p.getByRole("button", { name: "Sign up to accept" }).click();
  await expect(p.getByLabel("Email")).toHaveValue(email);
  await p.getByLabel("First name").fill("Pro");
  await p.getByLabel("Last name").fill("Ctor");
  await p.getByLabel(/Password/).fill(PASSWORD);
  await p.getByRole("button", { name: "Sign up" }).click();
  await expect(p).toHaveURL(/\/invite\//);
  await p.getByRole("button", { name: "Accept invite" }).click();
  await expect(p).toHaveURL(new RegExp(`/offerings/${offering.id}$`));
  await expect(p.getByText("You're a proctor")).toBeVisible();
  // Proctors see people but can't invite or upload rosters.
  await p.getByRole("tab", { name: "People" }).click();
  await expect(p.getByRole("button", { name: "Invite" })).toHaveCount(0);
  await expect(p.getByRole("tab", { name: "Roster upload" })).toHaveCount(0);

  await page.reload();
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByTestId("member-row").filter({ hasText: email })).not.toContainText("Invited");
});

test("an existing account is asked to log in to accept", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const coInstructor = await register();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  await page.getByLabel("Email").fill(coInstructor.email);
  await choose(page, "As", "Instructor");
  await page.getByRole("button", { name: "Invite" }).click();
  const link = await page.getByTestId("invite-link").innerText();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto(new URL(link).pathname);
  await expect(page.getByText(/Join .* as an instructor/)).toBeVisible();
  await page.getByRole("button", { name: "Log in to accept" }).click();
  await page.getByLabel("Password").fill(coInstructor.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("button", { name: "Accept invite" }).click();
  await expect(page.getByText("You're an instructor")).toBeVisible();
});

test("an invite can only be accepted by the person it was sent to", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const invited = await register();
  const someoneElse = await register();
  const { member } = await call(prof, "post", `/offerings/${offering.id}/members`, { email: invited.email, role: "STUDENT" });
  await openAs(page, someoneElse, `/invite/${tokenFrom(member.inviteUrl)}`);
  await page.getByRole("button", { name: "Accept invite" }).click();
  await expect(page.getByRole("alert")).toContainText(`This invite is for ${invited.email}`);
});

test("a used or unknown invite link says it's not valid", async ({ page }) => {
  await page.goto("/invite/not-a-real-token");
  await expect(page.getByRole("alert")).toContainText("not valid");
});

test("instructor makes a new invite link, and the old one stops working", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  const email = uniqueEmail("relink");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Invite" }).click();
  const first = await page.getByTestId("invite-link").innerText();
  await page.getByTestId("member-row").filter({ hasText: email }).getByRole("button", { name: "New link" }).click();
  await expect(page.getByTestId("invite-link")).not.toHaveText(first);
  await page.goto(new URL(first).pathname);
  await expect(page.getByRole("alert")).toContainText("not valid");
});

test("instructor changes someone's role and removes people", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const ta = await register();
  const gone = await register();
  await join(prof, offering.id, ta, "STUDENT");
  await join(prof, offering.id, gone, "STUDENT");
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();

  await choose(page, `Role for ${ta.email}`, "Proctor");
  // The list reloads from the API once the change is saved.
  await expect(page.getByRole("textbox", { name: `Role for ${ta.email}` })).toHaveValue("Proctor");
  await page.reload();
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByRole("textbox", { name: `Role for ${ta.email}` })).toHaveValue("Proctor");

  page.once("dialog", (d) => d.accept());
  await page.getByTestId("member-row").filter({ hasText: gone.email }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("member-row").filter({ hasText: gone.email })).toHaveCount(0);
});

test("an offering always keeps at least one instructor", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  await openAs(page, prof, `/offerings/${offering.id}`);
  await page.getByRole("tab", { name: "People" }).click();
  await choose(page, `Role for ${prof.email}`, "Student");
  await expect(page.getByRole("alert")).toContainText("at least one active instructor");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("member-row").filter({ hasText: prof.email }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("alert")).toContainText("at least one active instructor");
});

test("co-instructors can manage the offering too", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const co = await instructor();
  await join(prof, offering.id, co, "INSTRUCTOR");
  await openAs(page, co, `/offerings/${offering.id}`);
  await expect(page.getByRole("tab", { name: "Roster upload" })).toBeVisible();
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
});

test("students only see the exams tab", async ({ page }) => {
  const { prof, offering } = await seedOffering();
  const student = await register();
  await join(prof, offering.id, student, "STUDENT");
  await openAs(page, student, `/offerings/${offering.id}`);
  await expect(page.getByText("You're a student")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Exams" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "People" })).toHaveCount(0);
});
