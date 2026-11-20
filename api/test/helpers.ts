/**
 * Shared helpers for the integration tests.
 */
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

/** One app instance shared by all tests in a file. */
export const app = createApp();
/** Start a request against the app, e.g. `api().get("/health")`. No real port is opened. */
export const api = () => request(app);

/** Empty every table, so each test file starts from a clean database. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "SeatAssignment", "ExamRoom", "Exam", "Seat", "Room", "CourseMember", "Course", "User" CASCADE`,
  );
}

/** Create an account through the API and return its login token. */
export async function register(email: string, name = email.split("@")[0]) {
  const res = await api().post("/auth/register").send({ email, password: "password123", name });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user as { id: string; email: string } };
}

/** Headers that sign a request in as the owner of `token`. */
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Pull the token out of an invite link (".../invite/<token>"). */
export const tokenFromInviteUrl = (url: string) => url.split("/invite/")[1];

/** Fail the test setup loudly if a request didn't succeed. */
function expectOk(res: request.Response, what: string) {
  if (res.status >= 400) throw new Error(`${what} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

/**
 * A course with an instructor, a proctor and 12 students. Ana (ana@mail.com)
 * has accepted her invite; Bo needs an accessible seat; Cy is left-handed.
 */
export async function seedCourse() {
  const instructor = await register("prof@uni.ca", "Prof Smith");
  const course = expectOk(
    await api().post("/courses").set(auth(instructor.token)).send({ code: "ECE1779", name: "Cloud Computing" }),
    "create course",
  );
  const courseId: string = course.body.course.id;
  const csv = [
    "email,student_number,first_name,last_name,accessible,left_handed",
    "ana@mail.com,1001,Ana,Lee,,",
    "bo@mail.com,1002,Bo,Chan,yes,",
    "cy@mail.com,1003,Cy,Diaz,,yes",
    ...Array.from({ length: 9 }, (_, i) => `s${i}@mail.com,20${i},S,${i},,`),
  ].join("\n");
  const roster = expectOk(
    await api().post(`/courses/${courseId}/roster`).set(auth(instructor.token)).set("Content-Type", "text/csv").send(csv),
    "roster upload",
  );
  const invites = new Map<string, string>(
    roster.body.invites.map((i: { email: string; inviteUrl: string }) => [i.email, i.inviteUrl]),
  );

  const ta = expectOk(
    await api().post(`/courses/${courseId}/members`).set(auth(instructor.token)).send({ email: "ta@uni.ca", role: "PROCTOR" }),
    "invite proctor",
  );
  const proctor = await register("ta@uni.ca", "TA");
  expectOk(await api().post(`/invites/${tokenFromInviteUrl(ta.body.member.inviteUrl)}/accept`).set(auth(proctor.token)), "accept proctor");

  const student = await register("ana@mail.com", "Ana Lee");
  const accepted = expectOk(
    await api().post(`/invites/${tokenFromInviteUrl(invites.get("ana@mail.com")!)}/accept`).set(auth(student.token)),
    "accept student",
  );
  return { instructor, proctor, student, courseId, anaMemberId: accepted.body.member.id as string };
}

/**
 * Two rooms and an exam using both, with seating generated (seed 7).
 * Room A: rows of 4, 4 (aisle in the middle) and 6 seats; 2 accessible, 1 broken.
 * Room B: 2 rows of 3; 1 left-handed seat.
 */
export async function seedExam(instructorToken: string, courseId: string) {
  const a = expectOk(
    await api()
      .post("/rooms")
      .set(auth(instructorToken))
      .send({
        name: "BA 1130",
        rows: [
          { seats: 4 },
          { seats: [{ col: 0 }, { col: 1 }, { col: 3 }, { col: 4 }] },
          { seats: [{ col: 0, accessible: true }, { col: 1, accessible: true }, { col: 2, broken: true }, { col: 3 }, { col: 4 }, { col: 5 }] },
        ],
      }),
    "create room A",
  );
  const b = expectOk(
    await api().post("/rooms").set(auth(instructorToken)).send({ name: "BA 1160", rows: [{ seats: [{ col: 0, leftHanded: true }, { col: 1 }, { col: 2 }] }, { seats: 3 }] }),
    "create room B",
  );
  const exam = expectOk(
    await api()
      .post(`/courses/${courseId}/exams`)
      .set(auth(instructorToken))
      .send({ title: "Midterm", startsAt: "2026-12-01T14:00:00Z", durationMinutes: 120, roomIds: [a.body.room.id, b.body.room.id] }),
    "create exam",
  );
  const examId: string = exam.body.exam.id;
  expectOk(await api().post(`/exams/${examId}/seating/generate`).set(auth(instructorToken)).send({ seed: 7 }), "generate seating");
  return { examId, roomAId: a.body.room.id as string, roomBId: b.body.room.id as string };
}
