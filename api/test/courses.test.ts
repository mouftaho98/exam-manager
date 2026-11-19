import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, auth, register, resetDb, tokenFromInviteUrl } from "./helpers.js";

// Accounts, courses, invites and rosters, in order. Each test builds on the last.
describe("accounts, courses and invites", () => {
  let instructor: { token: string };
  let proctor: { token: string };
  let student: { token: string };
  let courseId: string;
  let inviteUrls: Record<string, string>;
  let anaMemberId: string;

  beforeAll(async () => {
    await resetDb();
    instructor = await register("prof@uni.ca", "Prof Smith");
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects requests without a token", async () => {
    const res = await api().get("/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("does not allow two accounts with the same email", async () => {
    const res = await api().post("/auth/register").send({ email: "PROF@uni.ca", password: "password123", name: "X" });
    expect(res.status).toBe(409);
  });

  it("logs in with the right password only", async () => {
    expect((await api().post("/auth/login").send({ email: "prof@uni.ca", password: "wrong-pass" })).status).toBe(401);
    expect((await api().post("/auth/login").send({ email: "prof@uni.ca", password: "password123" })).status).toBe(200);
  });

  it("creates a course with the creator as instructor", async () => {
    const res = await api().post("/courses").set(auth(instructor.token)).send({ code: "ECE1779", name: "Cloud Computing", term: "Fall 2026" });
    expect(res.status).toBe(201);
    courseId = res.body.course.id;
    const me = await api().get("/me").set(auth(instructor.token));
    expect(me.body.courses).toEqual([expect.objectContaining({ id: courseId, role: "INSTRUCTOR" })]);
  });

  it("uploads a roster CSV and returns invite links", async () => {
    const csv = [
      "email,student_number,first_name,last_name,accessible,left_handed",
      "ana@mail.com,1001,Ana,Lee,,",
      "bo@mail.com,1002,Bo,Chan,yes,",
      "cy@mail.com,1003,Cy,Diaz,,yes",
      ...Array.from({ length: 9 }, (_, i) => `s${i}@mail.com,20${i},S,${i},,`),
      "broken-row,9999,,,,",
    ].join("\n");
    const res = await api().post(`/courses/${courseId}/roster`).set(auth(instructor.token)).set("Content-Type", "text/csv").send(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(12);
    expect(res.body.errors).toHaveLength(1);
    inviteUrls = Object.fromEntries(res.body.invites.map((i: { email: string; inviteUrl: string }) => [i.email, i.inviteUrl]));

    // Uploading again updates instead of duplicating.
    const again = await api().post(`/courses/${courseId}/roster`).set(auth(instructor.token)).set("Content-Type", "text/csv").send(csv);
    expect(again.body).toMatchObject({ created: 0, updated: 12 });
  });

  it("invites a proctor", async () => {
    const res = await api().post(`/courses/${courseId}/members`).set(auth(instructor.token)).send({ email: "ta@uni.ca", role: "PROCTOR" });
    expect(res.status).toBe(201);
    proctor = await register("ta@uni.ca", "TA");
    const token = tokenFromInviteUrl(res.body.member.inviteUrl);
    expect((await api().post(`/invites/${token}/accept`).set(auth(proctor.token))).status).toBe(200);
  });

  it("lets a student see the invite, register and accept it", async () => {
    const token = tokenFromInviteUrl(inviteUrls["ana@mail.com"]);
    const info = await api().get(`/invites/${token}`);
    expect(info.body).toMatchObject({ email: "ana@mail.com", role: "STUDENT", accountExists: false, course: { code: "ECE1779" } });

    // Someone with a different email can't use Ana's invite.
    const other = await register("mallory@mail.com");
    expect((await api().post(`/invites/${token}/accept`).set(auth(other.token))).status).toBe(403);

    student = await register("ana@mail.com", "Ana Lee");
    expect((await api().get(`/invites/${token}`)).body.accountExists).toBe(true);
    const accept = await api().post(`/invites/${token}/accept`).set(auth(student.token));
    expect(accept.status).toBe(200);
    anaMemberId = accept.body.member.id;

    // The link is single-use.
    expect((await api().post(`/invites/${token}/accept`).set(auth(student.token))).status).toBe(404);
  });

  it("a student can be in several courses with different roles", async () => {
    // Ana creates her own course (e.g. she TAs it); she is instructor there and student in ECE1779.
    await api().post("/courses").set(auth(student.token)).send({ code: "APS100", name: "Other" });
    const me = await api().get("/me").set(auth(student.token));
    expect(me.body.courses.map((c: { role: string }) => c.role).sort()).toEqual(["INSTRUCTOR", "STUDENT"]);
  });

  it("keeps students out of staff-only routes", async () => {
    expect((await api().get(`/courses/${courseId}/members`).set(auth(student.token))).status).toBe(403);
    expect((await api().post(`/courses/${courseId}/roster`).set(auth(proctor.token)).set("Content-Type", "text/csv").send("email\nx@y.com")).status).toBe(403);
    const outsider = await register("outsider@mail.com");
    expect((await api().get(`/courses/${courseId}`).set(auth(outsider.token))).status).toBe(404);
  });

  it("shows the instructor who has joined and who is still invited", async () => {
    const res = await api().get(`/courses/${courseId}/members?role=STUDENT`).set(auth(instructor.token));
    expect(res.status).toBe(200);
    const ana = res.body.members.find((m: { id: string }) => m.id === anaMemberId);
    expect(ana).toMatchObject({ email: "ana@mail.com", status: "ACTIVE", name: "Ana Lee" });
    expect(ana.inviteUrl).toBeUndefined(); // used invite links are gone
    const bo = res.body.members.find((m: { email: string }) => m.email === "bo@mail.com");
    expect(bo).toMatchObject({ status: "INVITED", needsAccessible: true });
    expect(bo.inviteUrl).toMatch(/\/invite\//);

    // Proctors can see members but not invite links.
    const asProctor = await api().get(`/courses/${courseId}/members`).set(auth(proctor.token));
    expect(asProctor.body.members.every((m: { inviteUrl?: string }) => m.inviteUrl === undefined)).toBe(true);
  });

  it("keeps at least one instructor in a course", async () => {
    const members = await api().get(`/courses/${courseId}/members?role=INSTRUCTOR`).set(auth(instructor.token));
    const me = members.body.members[0];
    const res = await api().delete(`/courses/${courseId}/members/${me.id}`).set(auth(instructor.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("last_instructor");
  });
});
