/**
 * Integration tests for rooms, exams, seat generation and manual moves.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, auth, resetDb, seedCourse } from "./helpers.js";

type SeatView = {
  id: string;
  label: string;
  broken: boolean;
  accessible: boolean;
  leftHanded: boolean;
  student: { memberId: string; email: string } | null;
};

// Rooms, exams, seat generation and manual moves, in order. Each test builds on the last.
describe("rooms, exams and seating", () => {
  let instructor: { token: string };
  let proctor: { token: string };
  let student: { token: string };
  let courseId: string;
  let anaMemberId: string;
  let roomA: { id: string; rows: { seats: { id: string; label: string }[] }[] };
  let roomB: { id: string };
  let examId: string;
  let anaCode: string;

  // Every seat across the exam's rooms, from the staff seating map.
  const allSeats = async (): Promise<SeatView[]> => {
    const res = await api().get(`/exams/${examId}/seating`).set(auth(proctor.token));
    return res.body.rooms.flatMap((r: { rows: { seats: SeatView[] }[] }) => r.rows.flatMap((row) => row.seats));
  };

  beforeAll(async () => {
    await resetDb();
    ({ instructor, proctor, student, courseId, anaMemberId } = await seedCourse());
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates rooms whose rows have different lengths", async () => {
    const res = await api()
      .post("/rooms")
      .set(auth(instructor.token))
      .send({
        name: "BA 1130",
        building: "Bahen",
        rows: [
          { seats: 4 },
          { seats: [{ col: 0 }, { col: 1 }, { col: 3 }, { col: 4 }] }, // aisle at col 2
          { seats: [{ col: 0, accessible: true }, { col: 1, accessible: true }, { col: 2, broken: true }, { col: 3 }, { col: 4 }, { col: 5 }] },
        ],
      });
    expect(res.status).toBe(201);
    roomA = res.body.room;
    expect(roomA.rows.map((r) => r.seats.length)).toEqual([4, 4, 6]);
    expect(res.body.room.capacity).toBe(13);
    expect(roomA.rows[1].seats.map((s) => s.label)).toEqual(["B1", "B2", "B4", "B5"]);

    const b = await api().post("/rooms").set(auth(instructor.token)).send({ name: "BA 1160", rows: [{ seats: [{ col: 0, leftHanded: true }, { col: 1 }, { col: 2 }] }, { seats: 3 }] });
    roomB = b.body.room;
  });

  it("rejects a room with two seats in the same spot", async () => {
    const res = await api().post("/rooms").set(auth(instructor.token)).send({ name: "Bad", rows: [{ seats: [{ col: 0 }, { col: 0 }] }] });
    expect(res.status).toBe(400);
  });

  it("creates an exam in two rooms and generates seating", async () => {
    const exam = await api()
      .post(`/courses/${courseId}/exams`)
      .set(auth(instructor.token))
      .send({ title: "Midterm", startsAt: "2026-12-01T14:00:00Z", durationMinutes: 120, roomIds: [roomA.id, roomB.id] });
    expect(exam.status).toBe(201);
    examId = exam.body.exam.id;

    // Proctors can't regenerate seating; instructors can.
    expect((await api().post(`/exams/${examId}/seating/generate`).set(auth(proctor.token)).send({})).status).toBe(403);
    const gen = await api().post(`/exams/${examId}/seating/generate`).set(auth(instructor.token)).send({ seed: 7 });
    expect(gen.status).toBe(200);
    expect(gen.body.assigned).toBe(12); // 12 students, 19 usable seats
    expect(gen.body.unassigned).toEqual([]);

    const seats = await allSeats();
    expect(seats.find((s) => s.student?.email === "bo@mail.com")?.accessible).toBe(true);
    expect(seats.find((s) => s.student?.email === "cy@mail.com")?.leftHanded).toBe(true);
    expect(seats.some((s) => s.broken && s.student)).toBe(false);
  });

  it("shows a student their own seat and check-in code", async () => {
    const res = await api().get("/me/exams").set(auth(student.token));
    expect(res.body.exams).toHaveLength(1);
    const exam = res.body.exams[0];
    expect(exam.checkinCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    anaCode = exam.checkinCode;

    const detail = await api().get(`/exams/${examId}`).set(auth(student.token));
    expect(detail.body.mySeat.seat.label).toBe(exam.seat.label);
    expect(detail.body.mySeat.room.rows.length).toBeGreaterThan(0);
    // Students can't see the full seating chart.
    expect((await api().get(`/exams/${examId}/seating`).set(auth(student.token))).status).toBe(403);
  });

  it("keeps check-in codes when seating is regenerated", async () => {
    await api().post(`/exams/${examId}/seating/generate`).set(auth(instructor.token)).send({ seed: 99 });
    const res = await api().get("/me/exams").set(auth(student.token));
    expect(res.body.exams[0].checkinCode).toBe(anaCode);
  });

  it("refuses to remove a room that has students seated in it", async () => {
    const res = await api().put(`/exams/${examId}/rooms`).set(auth(instructor.token)).send({ roomIds: [roomA.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("room_in_use");
  });

  it("lets staff move and swap students", async () => {
    const seats = await allSeats();
    const emptySeat = seats.find((s) => !s.broken && !s.student)!;
    const otherSeat = seats.find((s) => s.student && s.student.memberId !== anaMemberId)!;

    const move = await api().patch(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token)).send({ seatId: emptySeat.id });
    expect(move.status).toBe(200);

    const taken = await api().patch(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token)).send({ seatId: otherSeat.id });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("seat_taken");

    const swap = await api().patch(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token)).send({ seatId: otherSeat.id, swap: true });
    expect(swap.status).toBe(200);
    expect(swap.body.moves).toHaveLength(2);
    const otherNow = await prisma.seatAssignment.findUnique({ where: { examId_memberId: { examId, memberId: otherSeat.student!.memberId } } });
    expect(otherNow?.seatId).toBe(emptySeat.id);

    const broken = seats.find((s) => s.broken)!;
    expect((await api().patch(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token)).send({ seatId: broken.id })).status).toBe(400);

    const ana = await prisma.seatAssignment.findUniqueOrThrow({ where: { examId_memberId: { examId, memberId: anaMemberId } } });
    expect(ana.checkinCode).toBe(anaCode); // moving doesn't change the code
    expect(ana.manual).toBe(true);
  });

  it("can unseat a student and seat them again by hand", async () => {
    expect((await api().delete(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token))).status).toBe(204);
    const seating = await api().get(`/exams/${examId}/seating`).set(auth(proctor.token));
    expect(seating.body.unassigned.map((s: { memberId: string }) => s.memberId)).toEqual([anaMemberId]);

    const free = (await allSeats()).find((s) => !s.broken && !s.student)!;
    const res = await api().patch(`/exams/${examId}/assignments/${anaMemberId}`).set(auth(proctor.token)).send({ seatId: free.id });
    expect(res.status).toBe(200);
    const again = await api().get("/me/exams").set(auth(student.token));
    expect(again.body.exams[0].seat.id).toBe(free.id);
    expect(again.body.exams[0].checkinCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  });
});
