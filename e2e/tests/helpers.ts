/**
 * Shared helpers for the UI tests.
 *
 * Every flow is exercised through the browser at least once. Tests that need
 * data from earlier steps (an exam with seats, say) create it through the API
 * instead, so each test stays fast and focused on the screen it's testing.
 * Every test makes its own users with unique emails.
 */
import { execFileSync } from "node:child_process";
import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const API_URL = "http://localhost:3100";
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://exam:exam@localhost:55432/exam_manager_e2e";
export const PASSWORD = "secret-pass-123";

export type TestUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  password: string;
  token: string;
};

let counter = 0;
/** A short unique suffix so every test gets its own users, courses and rooms. */
export function uid() {
  return `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
export const uniqueEmail = (prefix: string) => `${prefix}-${uid()}@e2e.test`;
/** Unique, digits-only student number (what a card barcode carries). */
export const studentNumber = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`.slice(-12);

/** API client, optionally signed in as `user`. */
export async function api(user?: Pick<TestUser, "token">): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: user ? { Authorization: `Bearer ${user.token}` } : {},
  });
}

/** One API call that must succeed. */
export async function call<T = any>(
  user: Pick<TestUser, "token"> | undefined,
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const ctx = await api(user);
  const res = await ctx[method](path, { data, headers });
  const text = await res.text();
  await ctx.dispose();
  if (!res.ok()) throw new Error(`${method.toUpperCase()} ${path} -> ${res.status()} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Register an account through the API. */
export async function register(opts: {
  email?: string;
  firstName?: string;
  lastName?: string;
  wantsToTeach?: boolean;
  needsAccessible?: boolean;
  leftHanded?: boolean;
} = {}): Promise<TestUser> {
  const firstName = opts.firstName ?? `First${uid()}`;
  const lastName = opts.lastName ?? "Tester";
  const email = opts.email ?? uniqueEmail(firstName.toLowerCase());
  const { email: _e, firstName: _f, lastName: _l, ...flags } = opts;
  const res = await call<{ token: string; user: { id: string } }>(undefined, "post", "/auth/register", {
    email, password: PASSWORD, firstName, lastName, ...flags,
  });
  return { id: res.user.id, email, firstName, lastName, name: `${firstName} ${lastName}`, password: PASSWORD, token: res.token };
}

/** Run an API script (src/scripts) against the e2e database. */
function apiScript(script: string, ...args: string[]) {
  execFileSync("npx", ["tsx", `src/scripts/${script}.ts`, ...args], {
    cwd: "../api",
    env: { ...process.env, DATABASE_URL },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

let adminPromise: Promise<TestUser> | undefined;
/** One admin per test worker (made with the real make-admin script). */
export function admin(): Promise<TestUser> {
  adminPromise ??= (async () => {
    const user = await register({ firstName: "Ada", lastName: "Admin" });
    apiScript("make-admin", user.email);
    return user;
  })();
  return adminPromise;
}

/** An approved instructor: signs up asking to teach, then the admin approves. */
export async function instructor(opts: { firstName?: string } = {}): Promise<TestUser> {
  const user = await register({ wantsToTeach: true, firstName: opts.firstName ?? `Prof${uid()}` });
  await call(await admin(), "post", `/admin/instructor-requests/${user.id}/approve`);
  return user;
}

export async function createCourse(owner: TestUser, code = `C${uid()}`.toUpperCase(), name = "Cloud Computing") {
  return (await call<{ course: { id: string; code: string; name: string } }>(owner, "post", "/courses", { code, name })).course;
}

export async function createOffering(owner: TestUser, courseId: string, year = 2026, semester = "FALL") {
  return (await call<{ offering: { id: string; term: string } }>(owner, "post", `/courses/${courseId}/offerings`, { year, semester })).offering;
}

/** A course with one offering, owned by `owner`. */
export async function seedOffering(owner?: TestUser) {
  const prof = owner ?? (await instructor());
  const course = await createCourse(prof);
  const offering = await createOffering(prof, course.id);
  return { prof, course, offering };
}

export const tokenFrom = (inviteUrl: string) => inviteUrl.split("/invite/")[1];

/** Invite `user` to an offering with `role` and accept it, so they're an active member. */
export async function join(prof: TestUser, offeringId: string, user: TestUser, role: "STUDENT" | "PROCTOR" | "INSTRUCTOR") {
  const { member } = await call(prof, "post", `/offerings/${offeringId}/members`, { email: user.email, role });
  await call(user, "post", `/invites/${tokenFrom(member.inviteUrl)}/accept`);
  return member as { id: string };
}

export type Student = TestUser & { studentNumber: string; memberId: string };

/**
 * Students as they really arrive: uploaded on the roster with a student
 * number, then they sign up with that email and accept their invite.
 */
export async function seedStudents(prof: TestUser, offeringId: string, count: number, needs: { needsAccessible?: boolean; leftHanded?: boolean }[] = []) {
  const people = Array.from({ length: count }, (_, i) => ({
    email: uniqueEmail(`student${i}`), number: studentNumber() + i, firstName: `Stu${i}${uid()}`, lastName: "Dent",
  }));
  const csv = ["email,student_number,first_name,last_name", ...people.map((p) => `${p.email},${p.number},${p.firstName},${p.lastName}`)].join("\n");
  const roster = await call<{ invites: { email: string; inviteUrl: string }[] }>(prof, "post", `/offerings/${offeringId}/roster`, csv, { "Content-Type": "text/csv" });
  const members = await call<{ members: { id: string; email: string }[] }>(prof, "get", `/offerings/${offeringId}/members?role=STUDENT`);
  const students: Student[] = [];
  for (const [i, p] of people.entries()) {
    const user = await register({ email: p.email, firstName: p.firstName, lastName: p.lastName, ...needs[i] });
    const invite = roster.invites.find((x) => x.email === p.email)!;
    await call(user, "post", `/invites/${tokenFrom(invite.inviteUrl)}/accept`);
    students.push({ ...user, studentNumber: p.number, memberId: members.members.find((m) => m.email === p.email)!.id });
  }
  return students;
}

type SeatSpec = { col: number; accessible?: boolean; leftHanded?: boolean; broken?: boolean };
export type RoomRow = number | SeatSpec[];
export async function createRoom(staff: TestUser, rows: RoomRow[], name = `Room ${uid()}`) {
  const { room } = await call(staff, "post", "/rooms", { name, rows: rows.map((seats) => ({ seats })) });
  return room as { id: string; name: string; capacity: number; rows: { row: number; seats: { id: string; label: string; accessible: boolean; leftHanded: boolean; broken: boolean }[] }[] };
}

export async function createExam(prof: TestUser, offeringId: string, roomIds: string[], title = `Exam ${uid()}`) {
  const startsAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  return (await call<{ exam: { id: string; title: string } }>(prof, "post", `/offerings/${offeringId}/exams`, { title, startsAt, durationMinutes: 120, roomIds })).exam;
}

export async function generate(prof: TestUser, examId: string, seed?: number) {
  return call<{ assigned: number; unassigned: unknown[]; warnings: string[] }>(prof, "post", `/exams/${examId}/seating/generate`, seed === undefined ? {} : { seed });
}

/** Where each student sits: studentId -> { seatId, label, roomId }. */
export async function seatingOf(staff: TestUser, examId: string) {
  const seating = await call(staff, "get", `/exams/${examId}/seating`);
  const map = new Map<string, { seatId: string; label: string; roomId: string; roomName: string; accessible: boolean; leftHanded: boolean }>();
  for (const room of seating.rooms) for (const row of room.rows) for (const s of row.seats) {
    if (s.student) map.set(s.student.studentId, { seatId: s.id, label: s.label, roomId: room.id, roomName: room.name, accessible: s.accessible, leftHanded: s.leftHanded });
  }
  return map;
}

/**
 * Exam day, ready to go: an instructor, an offering with students (signed up
 * and joined), a proctor, rooms, an exam and generated seating.
 */
export async function seedExam(opts: { students?: number; rooms?: RoomRow[][]; needs?: { needsAccessible?: boolean; leftHanded?: boolean }[]; seat?: boolean } = {}) {
  const { prof, course, offering } = await seedOffering();
  const students = await seedStudents(prof, offering.id, opts.students ?? 3, opts.needs);
  const proctor = await register({ firstName: `Proc${uid()}` });
  await join(prof, offering.id, proctor, "PROCTOR");
  const rooms = [];
  for (const rows of opts.rooms ?? [[3, 3]]) rooms.push(await createRoom(prof, rows));
  const exam = await createExam(prof, offering.id, rooms.map((r) => r.id));
  if (opts.seat !== false) await generate(prof, exam.id, 42);
  return { prof, course, offering, students, proctor, rooms, exam };
}

/** Open `path` already signed in as `user` (skips the login form). */
export async function openAs(page: Page, user: Pick<TestUser, "token">, path: string) {
  await page.goto("/");
  await page.evaluate((token) => localStorage.setItem("token", token), user.token);
  await page.goto(path);
}

/** Pick `option` in a Mantine Select / MultiSelect labelled `label`. */
export async function choose(page: Page, label: string | RegExp, option: string | RegExp, search?: string) {
  const input = page.getByRole("textbox", { name: label });
  await input.click();
  if (search) await input.fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

export { expect };

/** The exam page's seating card opens as a list; switch it to the seat map. */
export async function showMap(page: Page) {
  await page.getByText("Map", { exact: true }).click();
  await expect(page.getByTestId("seat-map").first()).toBeVisible();
}
