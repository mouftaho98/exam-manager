/**
 * Shared helpers for the UI tests.
 *
 * The UI is what's under test, so each flow is exercised through the browser
 * at least once. Tests that need data from an earlier step (an exam with
 * generated seats, say) create it through the API instead, which keeps them
 * fast and focused on the screen they're testing.
 */
import { execFileSync } from "node:child_process";
import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = "http://localhost:3100";
export const PASSWORD = "secret123";

export type Role = "STUDENT" | "PROCTOR" | "INSTRUCTOR";
export type TestUser = { name: string; email: string; password: string; role: Role; token: string; id: string };

/** A short unique suffix so every test gets its own users, courses and rooms. */
export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${uid()}@e2e.test`;
}

/** API client, optionally signed in as `user`. */
export async function api(user?: TestUser): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: user ? { Authorization: `Bearer ${user.token}` } : {},
  });
}

async function call<T>(ctx: APIRequestContext, method: "get" | "post" | "patch", path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await ctx[method](path, { data, headers });
  if (!res.ok()) throw new Error(`${method.toUpperCase()} ${path} -> ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Sign up a user through the API (for tests that aren't about sign-up). */
export async function signupViaApi(role: Role, name = `${role.toLowerCase()} ${uid()}`): Promise<TestUser> {
  const email = uniqueEmail(role.toLowerCase());
  const ctx = await api();
  const res = await call<{ token: string; user: { id: string } }>(ctx, "post", "/auth/signup", { email, password: PASSWORD, name, role });
  await ctx.dispose();
  return { name, email, password: PASSWORD, role, token: res.token, id: res.user.id };
}

/** Open `path` already signed in as `user` (skips the login form). */
export async function openAs(page: Page, user: TestUser, path: string) {
  await page.addInitScript((token) => window.localStorage.setItem("token", token), user.token);
  await page.goto(path);
}

/** Pick `option` in a Mantine Select / MultiSelect labelled `label`. */
export async function choose(page: Page, label: string | RegExp, option: string | RegExp, search?: string) {
  const input = page.getByRole("textbox", { name: label });
  await input.click();
  if (search) await input.fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

export async function setNeeds(user: TestUser, needs: { needsAccessible?: boolean; needsLeftHanded?: boolean }) {
  const ctx = await api(user);
  await call(ctx, "patch", "/auth/me", needs);
  await ctx.dispose();
}

export async function createCourse(instructor: TestUser, code = `C${uid()}`.toUpperCase(), name = "E2E Course") {
  const ctx = await api(instructor);
  const { course } = await call<{ course: { id: string; code: string; name: string } }>(ctx, "post", "/courses", { code, name });
  await ctx.dispose();
  return course;
}

export async function uploadRoster(instructor: TestUser, courseId: string, people: { name: string; email: string }[]) {
  const ctx = await api(instructor);
  const csv = ["name,email", ...people.map((p) => `${p.name},${p.email}`)].join("\n");
  await call(ctx, "post", `/courses/${courseId}/roster`, csv, { "Content-Type": "text/csv" });
  await ctx.dispose();
}

type SeatType = "NORMAL" | "LEFT_HANDED" | "ACCESSIBLE" | "BROKEN";
export async function createRoom(
  instructor: TestUser,
  rows: number,
  cols: number,
  specialSeats: { row: number; col: number; seatType: SeatType }[] = [],
  name = `Room ${uid()}`,
) {
  const ctx = await api(instructor);
  const { room } = await call<{ room: { id: string; name: string; seats: { id: string; row: number; col: number; label: string; seatType: SeatType }[] } }>(
    ctx, "post", "/rooms", { name, rows, cols, specialSeats },
  );
  await ctx.dispose();
  return room;
}

export async function createExam(instructor: TestUser, courseId: string, roomIds: string[], title = `Exam ${uid()}`) {
  const ctx = await api(instructor);
  const { exam } = await call<{ exam: { id: string; title: string } }>(ctx, "post", "/exams", { courseId, roomIds, title });
  await ctx.dispose();
  return exam;
}

export async function generateSeats(instructor: TestUser, examId: string) {
  const ctx = await api(instructor);
  const res = await call<{ assignments: { id: string; seatId: string; rosterEntry: { email: string } }[] }>(ctx, "post", `/exams/${examId}/generate`);
  await ctx.dispose();
  return res.assignments;
}

/**
 * Everything exam day needs: an instructor, a course with `students` signed up
 * and on the roster, a room, an exam and generated seats.
 */
export async function seedExam(opts: { students?: number; rows?: number; cols?: number } = {}) {
  const instructor = await signupViaApi("INSTRUCTOR");
  const students: TestUser[] = [];
  for (let i = 0; i < (opts.students ?? 3); i++) students.push(await signupViaApi("STUDENT", `Student${i} ${uid()}`));
  const course = await createCourse(instructor);
  await uploadRoster(instructor, course.id, students);
  const room = await createRoom(instructor, opts.rows ?? 2, opts.cols ?? 3);
  const exam = await createExam(instructor, course.id, [room.id]);
  const assignments = await generateSeats(instructor, exam.id);
  return { instructor, students, course, room, exam, assignments };
}

/**
 * Registers a student-card barcode. There's no API or screen for this yet, so
 * the row is inserted straight into the e2e database with Prisma's CLI.
 */
export function registerBarcode(barcode: string, student: TestUser) {
  const [firstName, ...rest] = student.name.split(" ");
  const id = `bc${uid()}`;
  const sql = `INSERT INTO "StudentBarcode" (id, barcode, "firstName", "lastName", "studentNumber", "studentId", email)
    VALUES ('${id}', '${barcode}', '${firstName}', '${rest.join(" ") || "-"}', '${barcode}', '${barcode}', '${student.email}');`;
  execFileSync("npx", ["prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], {
    cwd: "../api",
    input: sql,
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_e2e" },
    stdio: ["pipe", "ignore", "inherit"],
  });
}

export { expect };
