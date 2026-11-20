/**
 * Integration tests for exam-day check-in and attendance.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, auth, resetDb, seedCourse, seedExam } from "./helpers.js";

// Exam-day check-in and attendance, in order. Each test builds on the last.
describe("check-in and attendance", () => {
  let instructor: { token: string };
  let proctor: { token: string };
  let student: { token: string };
  let anaMemberId: string;
  let examId: string;
  let roomAId: string;
  let roomBId: string;
  let anaCode: string;
  let anaRoomId: string;

  beforeAll(async () => {
    await resetDb();
    let offeringId: string;
    ({ instructor, proctor, student, offeringId, anaMemberId } = await seedCourse());
    ({ examId, roomAId, roomBId } = await seedExam(instructor.token, offeringId));
    const mine = await api().get("/me/exams").set(auth(student.token));
    anaCode = mine.body.exams[0].checkinCode;
    anaRoomId = mine.body.exams[0].room.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("only staff can check students in", async () => {
    const res = await api().post(`/exams/${examId}/checkins`).set(auth(student.token)).send({ code: anaCode, roomId: anaRoomId });
    expect(res.status).toBe(403);
  });

  it("sends a student in the wrong room to the right one", async () => {
    const wrongRoom = anaRoomId === roomAId ? roomBId : roomAId;
    const res = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: anaCode, roomId: wrongRoom });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("wrong_room");
    expect(res.body.error.details.room.id).toBe(anaRoomId);
    expect(await prisma.checkIn.count({ where: { examId } })).toBe(0);
  });

  it("rejects unknown codes and rooms that aren't in the exam", async () => {
    const unknown = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: "ZZZZZZ", roomId: anaRoomId });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("unknown_code");
    const badRoom = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: anaCode, roomId: "nope" });
    expect(badRoom.status).toBe(400);
  });

  it("checks a student in once, and a retry returns the same check-in", async () => {
    // Codes are case-insensitive and ignore spaces / dashes.
    const typed = `${anaCode.slice(0, 3)}-${anaCode.slice(3)}`.toLowerCase();
    const first = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: typed, roomId: anaRoomId });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe("checked_in");

    const retry = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: anaCode, roomId: anaRoomId });
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("already_checked_in");
    expect(retry.body.checkedInAt).toBe(first.body.checkedInAt);
    expect(await prisma.checkIn.count({ where: { examId } })).toBe(1);

    const mine = await api().get("/me/exams").set(auth(student.token));
    expect(mine.body.exams[0].checkedInAt).toBe(first.body.checkedInAt);
  });

  it("records exactly one check-in when 50 scans of the same student arrive at once", async () => {
    const bo = await prisma.seatAssignment.findFirstOrThrow({ where: { examId, member: { user: { email: "bo@mail.com" } } } });
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ code: bo.checkinCode, roomId: bo.roomId }),
      ),
    );
    const statuses = results.map((r) => r.body.status);
    expect(statuses.filter((s) => s === "checked_in")).toHaveLength(1);
    expect(statuses.filter((s) => s === "already_checked_in")).toHaveLength(49);
    expect(await prisma.checkIn.count({ where: { examId, memberId: bo.memberId } })).toBe(1);
  });

  it("can check a student in by name when they lost their code", async () => {
    const cy = await prisma.seatAssignment.findFirstOrThrow({ where: { examId, member: { user: { email: "cy@mail.com" } } } });
    const res = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token)).send({ memberId: cy.memberId, roomId: cy.roomId });
    expect(res.status).toBe(201);
  });

  it("refuses to regenerate seating once check-in has started", async () => {
    const res = await api().post(`/exams/${examId}/seating/generate`).set(auth(instructor.token)).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("checkin_started");
  });

  it("shows who has checked in on the seating map", async () => {
    const res = await api().get(`/exams/${examId}/seating`).set(auth(proctor.token));
    const seated = res.body.rooms.flatMap((r: { rows: { seats: { student: { checkedInAt: string | null } | null }[] }[] }) =>
      r.rows.flatMap((row) => row.seats.filter((s) => s.student)),
    );
    expect(seated.filter((s: { student: { checkedInAt: string | null } }) => s.student.checkedInAt)).toHaveLength(3);
  });

  it("reports live attendance per room", async () => {
    const res = await api().get(`/exams/${examId}/attendance`).set(auth(proctor.token));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ assigned: 12, checkedIn: 3, missing: 9 });
    expect(res.body.rooms.reduce((n: number, r: { checkedIn: number }) => n + r.checkedIn, 0)).toBe(3);
    expect(res.body.missing).toHaveLength(9);

    const detail = await api().get(`/exams/${examId}`).set(auth(proctor.token));
    expect(detail.body.counts).toEqual({ students: 12, assigned: 12, checkedIn: 3 });
  });

  it("can undo a check-in", async () => {
    expect((await api().delete(`/exams/${examId}/checkins/${anaMemberId}`).set(auth(proctor.token))).status).toBe(204);
    const res = await api().get(`/exams/${examId}/attendance`).set(auth(proctor.token));
    expect(res.body.totals.checkedIn).toBe(2);
  });
});
