/**
 * Clearing an exam's seating, so its rooms can be changed and seating
 * generated again.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, auth, resetDb, seedCourse, seedExam } from "./helpers.js";

describe("clear seating", () => {
  let instructor: { token: string };
  let proctor: { token: string };
  let student: { token: string };
  let offeringId: string;
  let examId: string;
  let roomAId: string;
  let roomBId: string;

  beforeAll(async () => {
    await resetDb();
    ({ instructor, proctor, student, offeringId } = await seedCourse());
    ({ examId, roomAId, roomBId } = await seedExam(instructor.token, offeringId));
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is for instructors only", async () => {
    for (const who of [proctor, student]) {
      const res = await api().delete(`/exams/${examId}/seating`).set(auth(who.token));
      expect(res.status).toBe(403);
    }
    expect(await prisma.seatAssignment.count({ where: { examId } })).toBeGreaterThan(0);
  });

  it("refuses once students have checked in, unless told to discard the check-ins", async () => {
    const mine = await api().get("/me/exams").set(auth(student.token));
    const checkin = await api().post(`/exams/${examId}/checkins`).set(auth(proctor.token))
      .send({ code: mine.body.exams[0].checkinCode, roomId: mine.body.exams[0].room.id });
    expect(checkin.status).toBe(201);

    const refused = await api().delete(`/exams/${examId}/seating`).set(auth(instructor.token));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("checkin_started");
    expect(await prisma.seatAssignment.count({ where: { examId } })).toBeGreaterThan(0);

    const forced = await api().delete(`/exams/${examId}/seating?discardCheckins=true`).set(auth(instructor.token));
    expect(forced.status).toBe(200);
    expect(forced.body.checkInsRemoved).toBe(1);
    expect(await prisma.checkIn.count({ where: { examId } })).toBe(0);
  });

  it("removes every seat, so everyone is unseated and the exam is back to 'not generated'", async () => {
    // Already cleared above; seat everyone again, then clear without check-ins.
    await api().post(`/exams/${examId}/seating/generate`).set(auth(instructor.token)).send({ seed: 3 });
    const seated = await prisma.seatAssignment.count({ where: { examId } });
    expect(seated).toBeGreaterThan(0);

    const res = await api().delete(`/exams/${examId}/seating`).set(auth(instructor.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: seated, checkInsRemoved: 0 });
    expect(await prisma.seatAssignment.count({ where: { examId } })).toBe(0);

    const seating = await api().get(`/exams/${examId}/seating`).set(auth(instructor.token));
    expect(seating.body.rooms.flatMap((r: any) => r.rows.flatMap((row: any) => row.seats)).filter((s: any) => s.student)).toHaveLength(0);
    expect(seating.body.unassigned.length).toBe(seated);
    const detail = await api().get(`/exams/${examId}`).set(auth(instructor.token));
    expect(detail.body.exam.seatingGeneratedAt).toBeNull();
    const mine = await api().get("/me/exams").set(auth(student.token));
    expect(mine.body.exams[0].seat).toBeNull();
  });

  it("lets the rooms be changed afterwards, then seats everyone in the new room", async () => {
    const swap = await api().put(`/exams/${examId}/rooms`).set(auth(instructor.token)).send({ roomIds: [roomBId] });
    expect(swap.status).toBe(200);
    expect(swap.body.exam.rooms.map((r: { id: string }) => r.id)).toEqual([roomBId]);
    const generated = await api().post(`/exams/${examId}/seating/generate`).set(auth(instructor.token)).send({ seed: 5 });
    expect(generated.status).toBe(200);
    const inA = await prisma.seatAssignment.count({ where: { examId, roomId: roomAId } });
    expect(inA).toBe(0);
  });

  it("works on an exam that was never seated", async () => {
    await api().delete(`/exams/${examId}/seating`).set(auth(instructor.token));
    const again = await api().delete(`/exams/${examId}/seating`).set(auth(instructor.token));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ removed: 0, checkInsRemoved: 0 });
  });
});
