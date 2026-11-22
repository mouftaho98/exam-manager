/**
 * Integration tests for accounts, the course catalog, offerings, invites and
 * roster upload. They run against a real test database through the HTTP API.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, auth, register, registerInstructor, resetDb, tokenFromInviteUrl } from "./helpers.js";

// In order: each test builds on the last.
describe("accounts, courses, offerings and invites", () => {
  let instructor: { token: string };
  let proctor: { token: string };
  let student: { token: string };
  let courseId: string;
  let offeringId: string;
  let inviteUrls: Record<string, string>;
  let anaMemberId: string;

  const roster = [
    "email,student_number,first_name,last_name",
    "ana@mail.com,1001,Ana,Lee",
    "bo@mail.com,1002,Bo,Chan",
    "cy@mail.com,1003,Cy,Diaz",
    ...Array.from({ length: 9 }, (_, i) => `s${i}@mail.com,20${i},S,${i}`),
    "broken-row,9999,,",
  ].join("\n");
  const upload = (offering: string, csv: string, token = instructor.token) =>
    api().post(`/offerings/${offering}/roster`).set(auth(token)).set("Content-Type", "text/csv").send(csv);

  beforeAll(async () => {
    await resetDb();
    instructor = await registerInstructor("prof@uni.ca", "Prof Smith");
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects requests without a token", async () => {
    const res = await api().get("/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("registers with a first and last name, and allows only one account per email", async () => {
    const me = await api().get("/me").set(auth(instructor.token));
    expect(me.body.user).toMatchObject({ firstName: "Prof", lastName: "Smith", name: "Prof Smith" });
    const dup = await api().post("/auth/register").send({ email: "PROF@uni.ca", password: "password123", firstName: "X", lastName: "Y" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("email_taken");
  });

  it("logs in with the right password only", async () => {
    expect((await api().post("/auth/login").send({ email: "prof@uni.ca", password: "wrong-pass" })).status).toBe(401);
    expect((await api().post("/auth/login").send({ email: "prof@uni.ca", password: "password123" })).status).toBe(200);
  });

  it("only lets approved instructors add courses; an admin approves requests", async () => {
    // Asking to teach at sign-up leaves the request pending.
    const hopeful = await api()
      .post("/auth/register")
      .send({ email: "newprof@uni.ca", password: "password123", firstName: "New", lastName: "Prof", wantsToTeach: true });
    expect(hopeful.body.user.instructorStatus).toBe("PENDING");
    const token = hopeful.body.token;
    const blocked = await api().post("/courses").set(auth(token)).send({ code: "MIE100", name: "Dynamics" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatchObject({ code: "instructor_not_approved", message: expect.stringMatching(/waiting/) });

    // Only admins can see and decide requests.
    expect((await api().get("/admin/instructor-requests").set(auth(token))).status).toBe(403);
    const admin = await register("admin@uni.ca");
    await prisma.user.update({ where: { email: "admin@uni.ca" }, data: { isAdmin: true } });
    const pending = await api().get("/admin/instructor-requests").set(auth(admin.token));
    expect(pending.body.users.map((u: { email: string }) => u.email)).toEqual(["newprof@uni.ca"]);
    const approve = await api().post(`/admin/instructor-requests/${hopeful.body.user.id}/approve`).set(auth(admin.token));
    expect(approve.body.user.instructorStatus).toBe("APPROVED");
    expect((await api().post("/courses").set(auth(token)).send({ code: "MIE100", name: "Dynamics" })).status).toBe(201);
  });

  it("adds a course to the catalog once", async () => {
    const res = await api().post("/courses").set(auth(instructor.token)).send({ code: "ece 1779", name: "Cloud Computing" });
    expect(res.status).toBe(201);
    expect(res.body.course.code).toBe("ECE1779");
    courseId = res.body.course.id;

    const dup = await api().post("/courses").set(auth(instructor.token)).send({ code: "ECE1779", name: "Again" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: "course_exists", details: { courseId } });
    expect((await api().get("/courses?q=cloud").set(auth(instructor.token))).body.courses).toHaveLength(1);
    // Searching is open to everyone.
    const anyone = await register("browser@mail.com");
    expect((await api().get("/courses?q=ECE").set(auth(anyone.token))).body.courses).toHaveLength(1);
  });

  it("creates an offering with the creator as instructor, once per term", async () => {
    const res = await api().post(`/courses/${courseId}/offerings`).set(auth(instructor.token)).send({ year: 2026, semester: "FALL" });
    expect(res.status).toBe(201);
    expect(res.body.offering).toMatchObject({ year: 2026, semester: "FALL", term: "Fall 2026", course: { code: "ECE1779" } });
    offeringId = res.body.offering.id;

    const dup = await api().post(`/courses/${courseId}/offerings`).set(auth(instructor.token)).send({ year: 2026, semester: "FALL" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("offering_exists");
    expect((await api().post(`/courses/${courseId}/offerings`).set(auth(instructor.token)).send({ year: 2026, semester: "SPRING" })).status).toBe(400);

    const me = await api().get("/me").set(auth(instructor.token));
    expect(me.body.offerings).toEqual([expect.objectContaining({ id: offeringId, role: "INSTRUCTOR" })]);
  });

  it("uploads a roster CSV, creating people who have no account yet", async () => {
    const res = await upload(offeringId, roster);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(12);
    expect(res.body.errors).toHaveLength(1);
    inviteUrls = Object.fromEntries(res.body.invites.map((i: { email: string; inviteUrl: string }) => [i.email, i.inviteUrl]));

    // Person details are stored on the User, with no password yet.
    const bo = await prisma.user.findUniqueOrThrow({ where: { email: "bo@mail.com" } });
    expect(bo).toMatchObject({ firstName: "Bo", studentNumber: "1002", passwordHash: null });

    // Uploading again updates instead of duplicating.
    expect((await upload(offeringId, roster)).body).toMatchObject({ created: 0, updated: 12 });
  });

  it("invites a proctor", async () => {
    const res = await api().post(`/offerings/${offeringId}/members`).set(auth(instructor.token)).send({ email: "ta@uni.ca", role: "PROCTOR" });
    expect(res.status).toBe(201);
    proctor = await register("ta@uni.ca", "Tara Assistant");
    const token = tokenFromInviteUrl(res.body.member.inviteUrl);
    expect((await api().post(`/invites/${token}/accept`).set(auth(proctor.token))).status).toBe(200);
  });

  it("lets a student see the invite, register (taking over their roster record) and accept it", async () => {
    const token = tokenFromInviteUrl(inviteUrls["ana@mail.com"]);
    const info = await api().get(`/invites/${token}`);
    expect(info.body).toMatchObject({
      email: "ana@mail.com",
      role: "STUDENT",
      accountExists: false,
      offering: { term: "Fall 2026", course: { code: "ECE1779" } },
    });

    // Someone with a different email can't use Ana's invite.
    const other = await register("mallory@mail.com");
    expect((await api().post(`/invites/${token}/accept`).set(auth(other.token))).status).toBe(403);

    student = await register("ana@mail.com", "Ana Lee-Park");
    expect((await api().get(`/invites/${token}`)).body.accountExists).toBe(true);
    const accept = await api().post(`/invites/${token}/accept`).set(auth(student.token));
    expect(accept.status).toBe(200);
    anaMemberId = accept.body.member.id;

    // Same User record: the student number from the roster is still there, and her own name won.
    const me = await api().get("/me").set(auth(student.token));
    expect(me.body.user).toMatchObject({ studentNumber: "1001", name: "Ana Lee-Park" });

    // The link is single-use.
    expect((await api().post(`/invites/${token}/accept`).set(auth(student.token))).status).toBe(404);
  });

  it("shares a person's details across offerings, but not their role", async () => {
    // Bo is also in a second offering, as a proctor this time.
    const winter = await api().post(`/courses/${courseId}/offerings`).set(auth(instructor.token)).send({ year: 2027, semester: "WINTER" });
    const winterId = winter.body.offering.id;
    await api().post(`/offerings/${winterId}/members`).set(auth(instructor.token)).send({ email: "bo@mail.com", role: "PROCTOR" });


    // A registered user's name isn't overwritten by a roster.
    const again = await upload(winterId, "email,first_name,last_name\nana@mail.com,Annie,Lee\n");
    expect(again.body.created).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "ana@mail.com" } })).firstName).toBe("Ana");

    // Bo is already staff there, so the roster can't make him a student.
    const clash = await upload(winterId, "email\nbo@mail.com\n");
    expect(clash.body.errors[0].message).toMatch(/proctor/);

    // Two people can't share a student number.
    const taken = await upload(winterId, "email,student_number\nzed@mail.com,1001\n");
    expect(taken.body.errors[0].message).toMatch(/1001 already belongs to ana@mail.com/);
  });

  it("a student can be in several offerings with different roles", async () => {
    // Ana also teaches. She asks for instructor access after signing up, and an admin approves it.
    const asked = await api().post("/me/instructor-request").set(auth(student.token));
    expect(asked.body.user.instructorStatus).toBe("PENDING");
    const admin = await api().post("/auth/login").send({ email: "admin@uni.ca", password: "password123" });
    await api().post(`/admin/instructor-requests/${asked.body.user.id}/approve`).set(auth(admin.body.token));

    // She starts her own course; she is instructor there and student in ECE1779.
    const other = await api().post("/courses").set(auth(student.token)).send({ code: "APS100", name: "Other" });
    await api().post(`/courses/${other.body.course.id}/offerings`).set(auth(student.token)).send({ year: 2026, semester: "FALL" });
    const me = await api().get("/me").set(auth(student.token));
    expect(me.body.offerings.map((o: { role: string }) => o.role).sort()).toEqual(["INSTRUCTOR", "STUDENT"]);
  });

  it("keeps students out of staff-only routes", async () => {
    expect((await api().get(`/offerings/${offeringId}/members`).set(auth(student.token))).status).toBe(403);
    expect((await upload(offeringId, "email\nx@y.com", proctor.token)).status).toBe(403);
    const outsider = await register("outsider@mail.com");
    expect((await api().get(`/offerings/${offeringId}`).set(auth(outsider.token))).status).toBe(404);
    // Only the course's instructors can rename it.
    expect((await api().patch(`/courses/${courseId}`).set(auth(outsider.token)).send({ name: "Hacked" })).status).toBe(403);
  });

  it("lets students set their own accessibility needs, at sign-up and later", async () => {
    // Bo says he needs an accessible seat when he creates his account.
    const bo = await api()
      .post("/auth/register")
      .send({ email: "bo@mail.com", password: "password123", firstName: "Bo", lastName: "Chan", needsAccessible: true });
    expect(bo.body.user).toMatchObject({ needsAccessible: true, leftHanded: false, studentNumber: "1002" });

    // Later he also asks for a left-handed desk.
    const later = await api().patch("/me").set(auth(bo.body.token)).send({ leftHanded: true });
    expect(later.body.user).toMatchObject({ needsAccessible: true, leftHanded: true });

    // Instructors can't set these: the fields are ignored on invites and rosters.
    await api().post(`/offerings/${offeringId}/members`).set(auth(instructor.token)).send({ email: "zz@mail.com", role: "STUDENT", needsAccessible: true });
    await upload(offeringId, "email,accessible\nyy@mail.com,yes\n");
    const others = await prisma.user.findMany({ where: { email: { in: ["zz@mail.com", "yy@mail.com"] } } });
    expect(others.map((u) => u.needsAccessible)).toEqual([false, false]);
  });

  it("shows the instructor who has joined and who is still invited", async () => {
    const res = await api().get(`/offerings/${offeringId}/members?role=STUDENT`).set(auth(instructor.token));
    expect(res.status).toBe(200);
    const ana = res.body.members.find((m: { id: string }) => m.id === anaMemberId);
    expect(ana).toMatchObject({ email: "ana@mail.com", status: "ACTIVE", name: "Ana Lee-Park" });
    expect(ana.inviteUrl).toBeUndefined(); // used invite links are gone
    const bo = res.body.members.find((m: { email: string }) => m.email === "bo@mail.com");
    expect(bo).toMatchObject({ status: "INVITED", needsAccessible: true });
    expect(bo.inviteUrl).toMatch(/\/invite\//);

    // Proctors can see members but not invite links.
    const asProctor = await api().get(`/offerings/${offeringId}/members`).set(auth(proctor.token));
    expect(asProctor.body.members.every((m: { inviteUrl?: string }) => m.inviteUrl === undefined)).toBe(true);
  });

  it("lets an instructor invite a co-instructor", async () => {
    const res = await api().post(`/offerings/${offeringId}/members`).set(auth(instructor.token)).send({ email: "co@uni.ca", role: "INSTRUCTOR" });
    expect(res.status).toBe(201);
    expect(res.body.member.role).toBe("INSTRUCTOR");
  });

  it("keeps at least one instructor in an offering", async () => {
    const members = await api().get(`/offerings/${offeringId}/members?role=INSTRUCTOR`).set(auth(instructor.token));
    // The co-instructor hasn't accepted yet, so Prof Smith is the only active one.
    const me = members.body.members.find((m: { email: string }) => m.email === "prof@uni.ca");
    const res = await api().delete(`/offerings/${offeringId}/members/${me.id}`).set(auth(instructor.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("last_instructor");
  });

  it("lists a course's offerings with my role in each", async () => {
    const res = await api().get(`/courses/${courseId}`).set(auth(student.token));
    expect(res.body.offerings.map((o: { term: string; myRole: string | null }) => [o.term, o.myRole])).toEqual([
      ["Winter 2027", null], // invited there, but hasn't accepted yet
      ["Fall 2026", "STUDENT"],
    ]);
  });
});
