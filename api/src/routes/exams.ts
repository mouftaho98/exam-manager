import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { badRequest, forbidden, notFound } from "../errors.js";

const router = Router();
router.use(requireAuth);

function requireInstructor(req: any, _res: any, next: any) {
  if (req.user?.role !== "INSTRUCTOR") return next(forbidden("Instructor role required"));
  next();
}
function requireInstructorOrProctor(req: any, _res: any, next: any) {
  if (req.user?.role !== "INSTRUCTOR" && req.user?.role !== "PROCTOR") {
    return next(forbidden("Instructor or Proctor role required"));
  }
  next();
}

const createExamSchema = z.object({
  courseId: z.string().min(1),
  roomIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
});

router.post("/", requireInstructor, async (req, res, next) => {
  try {
    const data = createExamSchema.parse(req.body);
    const course = await prisma.course.findFirst({ where: { id: data.courseId, instructorId: req.user.userId } });
    if (!course) throw notFound("Course");
    const rooms = await prisma.room.findMany({ where: { id: { in: data.roomIds }, createdBy: req.user.userId } });
    if (rooms.length !== data.roomIds.length) throw notFound("One or more rooms not found");
    const exam = await prisma.exam.create({
      data: {
        courseId: data.courseId,
        title: data.title,
        rooms: { create: data.roomIds.map((roomId) => ({ roomId })) },
      },
      include: { course: true, rooms: { include: { room: true } } },
    });
    res.status(201).json({ exam });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireInstructorOrProctor, async (req, res, next) => {
  try {
    const where = req.user.role === "INSTRUCTOR" ? { course: { instructorId: req.user.userId } } : {};
    const exams = await prisma.exam.findMany({
      where,
      include: { course: true, rooms: { include: { room: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ exams });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/generate", requireInstructor, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findFirst({
      where: { id: req.params.id, course: { instructorId: req.user.userId } },
      include: {
        course: { include: { roster: true } },
        rooms: { include: { room: { include: { seats: true } } } },
        assignments: true,
      },
    });
    if (!exam) throw notFound("Exam");
    if (exam.assignments.length > 0) throw badRequest("Assignments already generated");

    const roster = exam.course.roster;
    const seats = exam.rooms.flatMap((er) => er.room.seats).filter((s) => s.seatType !== "BROKEN");
    if (roster.length > seats.length) throw badRequest(`Not enough seats: ${roster.length} students, ${seats.length} usable seats`);

    // look up user needs by email
    const emails = roster.map((r) => r.email.toLowerCase());
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, needsAccessible: true, needsLeftHanded: true } });
    const needMap = new Map(users.map((u) => [u.email.toLowerCase(), { needsAccessible: u.needsAccessible, needsLeftHanded: u.needsLeftHanded }]));

    // shuffle helper
    const shuffle = <T,>(arr: T[]) => arr.sort(() => Math.random() - 0.5);
    const accessibleSeats = shuffle(seats.filter((s) => s.seatType === "ACCESSIBLE"));
    const leftHandedSeats = shuffle(seats.filter((s) => s.seatType === "LEFT_HANDED"));
    const normalSeats = shuffle(seats.filter((s) => s.seatType === "NORMAL"));

    const needsAccessible = shuffle(roster.filter((r) => (needMap.get(r.email.toLowerCase())?.needsAccessible)));
    const needsLeftHanded = shuffle(roster.filter((r) => {
      const n = needMap.get(r.email.toLowerCase());
      return n?.needsLeftHanded && !n?.needsAccessible;
    }));
    const others = shuffle(roster.filter((r) => {
      const n = needMap.get(r.email.toLowerCase());
      return !n?.needsAccessible && !n?.needsLeftHanded;
    }));

    const assignments: { rosterEntryId: string; seatId: string }[] = [];
    // assign accessible
    for (const r of needsAccessible) {
      const seat = accessibleSeats.pop() || leftHandedSeats.pop() || normalSeats.pop();
      if (!seat) throw badRequest("Not enough suitable seats for accessible students");
      assignments.push({ rosterEntryId: r.id, seatId: seat.id });
    }
    // assign left handed
    for (const r of needsLeftHanded) {
      const seat = leftHandedSeats.pop() || normalSeats.pop();
      if (!seat) throw badRequest("Not enough suitable seats for left-handed students");
      assignments.push({ rosterEntryId: r.id, seatId: seat.id });
    }
    // assign others
    const remaining = [...normalSeats, ...leftHandedSeats, ...accessibleSeats]; // any leftover
    shuffle(remaining);
    for (const r of others) {
      const seat = remaining.pop();
      if (!seat) throw badRequest("Not enough seats");
      assignments.push({ rosterEntryId: r.id, seatId: seat.id });
    }

    await prisma.seatAssignment.createMany({ data: assignments.map((a) => ({ examId: exam.id, ...a })) });
    const result = await prisma.seatAssignment.findMany({
      where: { examId: exam.id },
      include: { seat: true, rosterEntry: true },
    });
    res.json({ assignments: result });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/assignments", requireInstructorOrProctor, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id } });
    if (!exam) throw notFound("Exam");
    const assignments = await prisma.seatAssignment.findMany({
      where: { examId: exam.id },
      include: { seat: { include: { room: true } }, rosterEntry: true },
      orderBy: { seat: { label: "asc" } },
    });
    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/checkin", requireInstructorOrProctor, async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) throw badRequest("email is required");
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id } });
    if (!exam) throw notFound("Exam");
    const assignment = await prisma.seatAssignment.findFirst({
      where: { examId: exam.id, rosterEntry: { email: email.toLowerCase() } },
      include: { seat: { include: { room: true } }, rosterEntry: true },
    });
    if (!assignment) throw notFound("Assignment for that email");
    const updated = await prisma.seatAssignment.update({
      where: { id: assignment.id },
      data: { checkedIn: true, checkedInAt: new Date() },
      include: { seat: { include: { room: true } }, rosterEntry: true },
    });
    const io = req.app.get("io");
    if (io) io.to(`exam:${exam.id}`).emit("checkin", updated);
    res.json({ assignment: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/checkin-by-barcode", requireInstructorOrProctor, async (req, res, next) => {
  try {
    const { barcode } = req.body as { barcode?: string };
    if (!barcode) throw badRequest("barcode is required");
    const exam = await prisma.exam.findFirst({ where: { id: req.params.id } });
    if (!exam) throw notFound("Exam");
    const barcodeRec = await prisma.studentBarcode.findUnique({ where: { barcode: barcode.trim() } });
    if (!barcodeRec) throw notFound("Barcode not registered");
    const email = (barcodeRec.email || `${barcodeRec.studentId}@mail.utoronto.ca`).toLowerCase();
    const assignment = await prisma.seatAssignment.findFirst({
      where: { examId: exam.id, rosterEntry: { email } },
      include: { seat: { include: { room: true } }, rosterEntry: true },
    });
    if (!assignment) throw notFound("No assignment found for this student in this exam (email: " + email + ")");
    if (assignment.checkedIn) {
      return res.json({ assignment, message: "Already checked in" });
    }
    const updated = await prisma.seatAssignment.update({
      where: { id: assignment.id },
      data: { checkedIn: true, checkedInAt: new Date() },
      include: { seat: { include: { room: true } }, rosterEntry: true },
    });
    const io = req.app.get("io");
    if (io) io.to(`exam:${exam.id}`).emit("checkin", updated);
    res.json({ assignment: updated });
  } catch (err) {
    next(err);
  }
});

router.get("/my/list", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("User");
    const assignments = await prisma.seatAssignment.findMany({
      where: { rosterEntry: { email: user.email.toLowerCase() } },
      include: { seat: { include: { room: { include: { seats: { orderBy: [{ row: 'asc' }, { col: 'asc' }] } } } } }, exam: { include: { rooms: { include: { room: true } }, course: true } }, rosterEntry: true },
      orderBy: { exam: { createdAt: "desc" } },
    });
    res.json({ assignments });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/my-assignment", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as any).user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound("User");
    const assignment = await prisma.seatAssignment.findFirst({
      where: { examId: req.params.id, rosterEntry: { email: user.email.toLowerCase() } },
      include: { seat: { include: { room: { include: { seats: { orderBy: [{ row: 'asc' }, { col: 'asc' }] } } } } }, exam: { include: { rooms: { include: { room: true } }, course: true } }, rosterEntry: true },
    });
    if (!assignment) throw notFound("Assignment");
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

export default router;
