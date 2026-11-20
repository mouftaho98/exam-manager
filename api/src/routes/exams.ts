/**
 * Exams and their seating.
 *
 * Who can do what:
 * - instructors create and edit exams, choose rooms and generate seating
 * - proctors (and instructors) see the full seating map and move students
 * - students only see their own seat, through GET /exams/:id or GET /me/exams
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma, type OfferingMember, type User } from "@prisma/client";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../auth.js";
import { INSTRUCTOR_ONLY, STAFF, requireExamRole, requireOfferingRole } from "../access.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { uniqueCheckinCodes } from "../codes.js";
import { assignSeats, seededRandom } from "../seating.js";
import { personName, seatDto, seatRows } from "../serializers.js";

export const examsRouter = Router();
// Mounted at "/", so require sign-in only on this router's own paths.
examsRouter.use(["/offerings", "/exams"], requireAuth);

// ---- Request body shapes ----

const examBody = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date(), // ISO string, e.g. "2026-12-01T14:00:00Z"
  durationMinutes: z.number().int().min(1).max(24 * 60),
  roomIds: z.array(z.string().min(1)).max(50).optional(),
});

const roomsBody = z.object({ roomIds: z.array(z.string().min(1)).max(50) });
// `seed` makes generation repeatable; leave it out for a random seating.
const generateBody = z.object({ seed: z.number().int().optional() }).default({});
const moveBody = z.object({ seatId: z.string().min(1), swap: z.boolean().optional() });

// The database client inside a transaction (same API as `prisma`).
type Tx = Prisma.TransactionClient;

// A student member with their person details loaded.
type Student = OfferingMember & { user: User };

/** The student fields the seating screens need. */
const studentSummary = (m: Student) => ({
  memberId: m.id,
  name: personName(m.user),
  email: m.user.email,
  studentNumber: m.user.studentNumber,
  needsAccessible: m.user.needsAccessible,
  leftHanded: m.user.leftHanded,
});

/** Throw 400 unless every room id exists. Returns the ids with duplicates removed. */
async function assertRoomsExist(roomIds: string[]) {
  const unique = [...new Set(roomIds)];
  const found = await prisma.room.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw badRequest("One or more rooms do not exist");
  return unique;
}

/** Ids of the rooms this exam uses. */
async function examRoomIds(tx: Tx, examId: string) {
  return (await tx.examRoom.findMany({ where: { examId }, select: { roomId: true } })).map((r) => r.roomId);
}

// ---------- Exams ----------

/** Create an exam in an offering, optionally with its rooms. Instructors only. */
examsRouter.post("/offerings/:offeringId/exams", async (req, res) => {
  const offeringId = req.params.offeringId;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  const { roomIds, ...body } = examBody.parse(req.body);
  const rooms = roomIds ? await assertRoomsExist(roomIds) : [];
  const exam = await prisma.exam.create({
    data: { ...body, offeringId, rooms: { create: rooms.map((roomId) => ({ roomId })) } },
    include: { rooms: { include: { room: true } } },
  });
  res.status(201).json({ exam: examDto(exam) });
});

/** All exams in an offering, soonest first. Any member. */
examsRouter.get("/offerings/:offeringId/exams", async (req, res) => {
  await requireOfferingRole(currentUser(req).id, req.params.offeringId);
  const exams = await prisma.exam.findMany({
    where: { offeringId: req.params.offeringId },
    orderBy: { startsAt: "asc" },
    include: { rooms: { include: { room: true } } },
  });
  res.json({ exams: exams.map(examDto) });
});

/**
 * One exam. What you get depends on your role: students get their own seat,
 * staff get counts for the whole exam.
 */
examsRouter.get("/exams/:examId", async (req, res) => {
  const { exam, member } = await requireExamRole(currentUser(req).id, req.params.examId);
  const full = await prisma.exam.findUniqueOrThrow({
    where: { id: exam.id },
    include: { rooms: { include: { room: true } } },
  });
  if (member.role === "STUDENT") {
    // Students see only their own seat, plus the room map to find it.
    const assignment = await prisma.seatAssignment.findUnique({
      where: { examId_memberId: { examId: exam.id, memberId: member.id } },
      include: { seat: { include: { room: { include: { seats: true } } } } },
    });
    res.json({
      exam: examDto(full),
      myRole: member.role,
      mySeat: assignment
        ? {
            checkinCode: assignment.checkinCode,
            seat: seatDto(assignment.seat),
            room: {
              id: assignment.seat.room.id,
              name: assignment.seat.room.name,
              building: assignment.seat.room.building,
              rows: seatRows(assignment.seat.room.seats).map((r) => ({ row: r.row, seats: r.seats.map(seatDto) })),
            },
          }
        : null,
    });
    return;
  }
  // Staff view: how many students are seated out of how many in the offering.
  const [assigned, students] = await Promise.all([
    prisma.seatAssignment.count({ where: { examId: exam.id } }),
    prisma.offeringMember.count({ where: { offeringId: exam.offeringId, role: "STUDENT" } }),
  ]);
  res.json({ exam: examDto(full), myRole: member.role, counts: { students, assigned } });
});

/** Edit title, time or duration. Rooms are changed with PUT /exams/:id/rooms. */
examsRouter.patch("/exams/:examId", async (req, res) => {
  await requireExamRole(currentUser(req).id, req.params.examId, INSTRUCTOR_ONLY);
  const { roomIds: _ignored, ...body } = examBody.partial().parse(req.body);
  const exam = await prisma.exam.update({
    where: { id: req.params.examId },
    data: body,
    include: { rooms: { include: { room: true } } },
  });
  res.json({ exam: examDto(exam) });
});

/** Delete an exam and its seating. Instructors only. */
examsRouter.delete("/exams/:examId", async (req, res) => {
  await requireExamRole(currentUser(req).id, req.params.examId, INSTRUCTOR_ONLY);
  await prisma.exam.delete({ where: { id: req.params.examId } });
  res.status(204).end();
});

// Set which rooms the exam uses. A room can't be removed while students are seated in it.
examsRouter.put("/exams/:examId/rooms", async (req, res) => {
  const { exam } = await requireExamRole(currentUser(req).id, req.params.examId, INSTRUCTOR_ONLY);
  const roomIds = await assertRoomsExist(roomsBody.parse(req.body).roomIds);
  const seatedInRemoved = await prisma.seatAssignment.count({
    where: { examId: exam.id, roomId: { notIn: roomIds } },
  });
  if (seatedInRemoved > 0) {
    throw conflict("room_in_use", "Students are seated in a room you removed; regenerate seating or move them first");
  }
  // Replace the room list in one transaction.
  await prisma.$transaction([
    prisma.examRoom.deleteMany({ where: { examId: exam.id } }),
    prisma.examRoom.createMany({ data: roomIds.map((roomId) => ({ examId: exam.id, roomId })) }),
  ]);
  const updated = await prisma.exam.findUniqueOrThrow({
    where: { id: exam.id },
    include: { rooms: { include: { room: true } } },
  });
  res.json({ exam: examDto(updated) });
});

// ---------- Seating ----------

/**
 * Randomly seat every student in the offering across the exam's rooms.
 * Replaces the current seating, but keeps each student's check-in code.
 */
examsRouter.post("/exams/:examId/seating/generate", async (req, res) => {
  const { exam } = await requireExamRole(currentUser(req).id, req.params.examId, INSTRUCTOR_ONLY);
  const { seed } = generateBody.parse(req.body ?? {});
  // Pick a seed if none was given, and return it so this seating can be reproduced.
  const usedSeed = seed ?? Math.floor(Math.random() * 2 ** 31);

  // Serializable: if a proctor moves someone while this runs, one of the two
  // is retried/rejected instead of both writing over each other.
  const result = await prisma.$transaction(
    async (tx) => {
      const roomIds = await examRoomIds(tx, exam.id);
      if (roomIds.length === 0) throw badRequest("Add at least one room to the exam first");

      const [seats, students, previous] = await Promise.all([
        tx.seat.findMany({ where: { roomId: { in: roomIds } } }),
        tx.offeringMember.findMany({ where: { offeringId: exam.offeringId, role: "STUDENT" }, include: { user: true } }),
        tx.seatAssignment.findMany({ where: { examId: exam.id } }),
      ]);
      // Work out the new seating in memory (see seating.ts).
      // Accessibility needs are stored on the person (User).
      const needs = students.map((s) => ({ id: s.id, needsAccessible: s.user.needsAccessible, leftHanded: s.user.leftHanded }));
      const plan = assignSeats(seats, needs, seededRandom(usedSeed));

      // Students keep their existing check-in code; only newly seated students get a new one.
      const oldCodes = new Map(previous.map((a) => [a.memberId, a.checkinCode]));
      const needCodes = [...plan.assignments.keys()].filter((id) => !oldCodes.has(id));
      const freshCodes = uniqueCheckinCodes(needCodes.length, oldCodes.values());
      needCodes.forEach((id, i) => oldCodes.set(id, freshCodes[i]));

      // Replace the old seating with the new one.
      const seatRoom = new Map(seats.map((s) => [s.id, s.roomId]));
      await tx.seatAssignment.deleteMany({ where: { examId: exam.id } });
      await tx.seatAssignment.createMany({
        data: [...plan.assignments].map(([memberId, seatId]) => ({
          examId: exam.id,
          memberId,
          seatId,
          roomId: seatRoom.get(seatId)!,
          checkinCode: oldCodes.get(memberId)!,
        })),
      });
      await tx.exam.update({ where: { id: exam.id }, data: { seatingGeneratedAt: new Date() } });

      // Report who couldn't be seated, by name, so the instructor can fix it.
      const byId = new Map(students.map((s) => [s.id, s]));
      return {
        assigned: plan.assignments.size,
        unassigned: plan.unassigned.map((id) => studentSummary(byId.get(id)!)),
        warnings: plan.warnings,
      };
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );

  res.json({ ...result, seed: usedSeed });
});

/** Full seating map for staff: every seat and who sits there. */
examsRouter.get("/exams/:examId/seating", async (req, res) => {
  const { exam } = await requireExamRole(currentUser(req).id, req.params.examId, STAFF);
  const roomIds = await examRoomIds(prisma, exam.id);
  const [rooms, assignments, students] = await Promise.all([
    prisma.room.findMany({ where: { id: { in: roomIds } }, include: { seats: true }, orderBy: { name: "asc" } }),
    prisma.seatAssignment.findMany({ where: { examId: exam.id }, include: { member: { include: { user: true } } } }),
    prisma.offeringMember.findMany({ where: { offeringId: exam.offeringId, role: "STUDENT" }, include: { user: true } }),
  ]);
  // Look up who sits in each seat, and who has no seat yet.
  const bySeat = new Map(assignments.map((a) => [a.seatId, a]));
  const seated = new Set(assignments.map((a) => a.memberId));

  res.json({
    examId: exam.id,
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      building: room.building,
      rows: seatRows(room.seats).map((r) => ({
        row: r.row,
        seats: r.seats.map((seat) => {
          const a = bySeat.get(seat.id);
          return {
            ...seatDto(seat),
            student: a
              ? { ...studentSummary(a.member), manual: a.manual }
              : null,
          };
        }),
      })),
    })),
    // Students with no seat, e.g. added after seating was generated, or unseated by hand.
    unassigned: students.filter((s) => !seated.has(s.id)).map(studentSummary),
  });
});

/**
 * Move a student to a seat (staff only). If the seat is taken, pass
 * swap: true to swap the two students, otherwise you get 409 seat_taken.
 */
examsRouter.patch("/exams/:examId/assignments/:memberId", async (req, res) => {
  const { exam } = await requireExamRole(currentUser(req).id, req.params.examId, STAFF);
  const { seatId, swap } = moveBody.parse(req.body);
  const memberId = req.params.memberId;

  const moves = await prisma.$transaction(
    async (tx) => {
      // Check the student and the seat are valid for this exam.
      const member = await tx.offeringMember.findFirst({
        where: { id: memberId, offeringId: exam.offeringId, role: "STUDENT" },
      });
      if (!member) throw notFound("Student");
      const seat = await tx.seat.findUnique({ where: { id: seatId } });
      const roomIds = await examRoomIds(tx, exam.id);
      if (!seat || !roomIds.includes(seat.roomId)) throw badRequest("That seat is not in one of this exam's rooms");
      if (seat.broken) throw badRequest(`Seat ${seat.label} is marked broken`);

      // Where the student sits now (if anywhere), and who is in the target seat (if anyone).
      const current = await tx.seatAssignment.findUnique({
        where: { examId_memberId: { examId: exam.id, memberId } },
      });
      const occupant = await tx.seatAssignment.findUnique({
        where: { examId_seatId: { examId: exam.id, seatId } },
        include: { member: { include: { user: true } } },
      });
      if (occupant?.memberId === memberId) return []; // already there: nothing to do

      if (occupant && !swap) {
        throw conflict("seat_taken", `Seat ${seat.label} is taken by ${personName(occupant.member.user)}`, {
          occupant: studentSummary(occupant.member),
        });
      }
      if (occupant && !current) {
        throw conflict("seat_taken", `Seat ${seat.label} is taken and this student has no seat to swap`);
      }

      if (occupant && current) {
        // Swap: free the target seat, move the student, then put the occupant in the old seat.
        await tx.seatAssignment.delete({ where: { id: occupant.id } });
        await tx.seatAssignment.update({
          where: { id: current.id },
          data: { seatId: seat.id, roomId: seat.roomId, manual: true },
        });
        await tx.seatAssignment.create({
          data: {
            examId: exam.id,
            memberId: occupant.memberId,
            seatId: current.seatId,
            roomId: current.roomId,
            checkinCode: occupant.checkinCode,
            manual: true,
          },
        });
        return [
          { memberId, seatId: seat.id, roomId: seat.roomId },
          { memberId: occupant.memberId, seatId: current.seatId, roomId: current.roomId },
        ];
      }

      // Target seat is free: move the student there, or seat them if they had no seat.
      if (current) {
        await tx.seatAssignment.update({
          where: { id: current.id },
          data: { seatId: seat.id, roomId: seat.roomId, manual: true },
        });
      } else {
        // New seat for an unseated student: give them a fresh code that isn't in use.
        const taken = (await tx.seatAssignment.findMany({ where: { examId: exam.id }, select: { checkinCode: true } })).map(
          (a) => a.checkinCode,
        );
        await tx.seatAssignment.create({
          data: {
            examId: exam.id,
            memberId,
            seatId: seat.id,
            roomId: seat.roomId,
            checkinCode: uniqueCheckinCodes(1, taken)[0],
            manual: true,
          },
        });
      }
      return [{ memberId, seatId: seat.id, roomId: seat.roomId }];
    },
    { isolationLevel: "Serializable" },
  );

  // Every seat change, so the client can update its map.
  res.json({ moves });
});

/** Take a student out of their seat (they show up under "unassigned"). Staff only. */
examsRouter.delete("/exams/:examId/assignments/:memberId", async (req, res) => {
  const { exam } = await requireExamRole(currentUser(req).id, req.params.examId, STAFF);
  await prisma.seatAssignment.deleteMany({
    where: { examId: exam.id, memberId: req.params.memberId },
  });
  res.status(204).end();
});

/** An exam as the API returns it, with its rooms. */
function examDto(exam: Prisma.ExamGetPayload<{ include: { rooms: { include: { room: true } } } }>) {
  return {
    id: exam.id,
    offeringId: exam.offeringId,
    title: exam.title,
    startsAt: exam.startsAt,
    durationMinutes: exam.durationMinutes,
    seatingGeneratedAt: exam.seatingGeneratedAt,
    rooms: exam.rooms.map((r) => ({ id: r.room.id, name: r.room.name, building: r.room.building })),
  };
}
