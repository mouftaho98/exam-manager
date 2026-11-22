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
  roomId: z.string().min(1),
  title: z.string().min(1),
});

router.post("/", requireInstructor, async (req, res, next) => {
  try {
    const data = createExamSchema.parse(req.body);
    // verify course belongs to instructor
    const course = await prisma.course.findFirst({ where: { id: data.courseId, instructorId: req.user.userId } });
    if (!course) throw notFound("Course");
    const room = await prisma.room.findFirst({ where: { id: data.roomId, createdBy: req.user.userId } });
    if (!room) throw notFound("Room");
    const exam = await prisma.exam.create({
      data: { courseId: data.courseId, roomId: data.roomId, title: data.title },
    });
    res.status(201).json({ exam });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireInstructor, async (req, res, next) => {
  try {
    const exams = await prisma.exam.findMany({
      where: { course: { instructorId: req.user.userId } },
      include: { course: true, room: true },
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
        room: { include: { seats: true } },
        assignments: true,
      },
    });
    if (!exam) throw notFound("Exam");
    if (exam.assignments.length > 0) throw badRequest("Assignments already generated");

    const roster = exam.course.roster;
    const seats = exam.room.seats.filter((s) => s.seatType !== "BROKEN");
    if (roster.length > seats.length) throw badRequest(`Not enough seats: ${roster.length} students, ${seats.length} usable seats`);

    // shuffle helper
    const shuffle = <T,>(arr: T[]) => arr.sort(() => Math.random() - 0.5);
    const accessibleSeats = shuffle(seats.filter((s) => s.seatType === "ACCESSIBLE"));
    const leftHandedSeats = shuffle(seats.filter((s) => s.seatType === "LEFT_HANDED"));
    const normalSeats = shuffle(seats.filter((s) => s.seatType === "NORMAL"));

    const needsAccessible = shuffle(roster.filter((r) => r.needsAccessible));
    const needsLeftHanded = shuffle(roster.filter((r) => r.needsLeftHanded && !r.needsAccessible));
    const others = shuffle(roster.filter((r) => !r.needsAccessible && !r.needsLeftHanded));

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

router.get("/:id/assignments", requireInstructor, async (req, res, next) => {
  try {
    const exam = await prisma.exam.findFirst({
      where: { id: req.params.id, course: { instructorId: req.user.userId } },
    });
    if (!exam) throw notFound("Exam");
    const assignments = await prisma.seatAssignment.findMany({
      where: { examId: exam.id },
      include: { seat: true, rosterEntry: true },
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
      include: { seat: true, rosterEntry: true },
    });
    if (!assignment) throw notFound("Assignment for that email");
    const updated = await prisma.seatAssignment.update({
      where: { id: assignment.id },
      data: { checkedIn: true, checkedInAt: new Date() },
      include: { seat: true, rosterEntry: true },
    });
    res.json({ assignment: updated });
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
      include: { seat: true, exam: { include: { room: true, course: true } }, rosterEntry: true },
    });
    if (!assignment) throw notFound("Assignment");
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

export default router;
