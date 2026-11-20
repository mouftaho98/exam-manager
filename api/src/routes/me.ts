/**
 * The signed-in user's own data (mounted at /me, behind requireAuth).
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { notFound } from "../errors.js";
import { seatDto } from "../serializers.js";

export const meRouter = Router();

/** The signed-in user and every course they belong to, with their role in each. */
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    // Only courses they've joined, not pending invites.
    include: { memberships: { where: { status: "ACTIVE" }, include: { course: true } } },
  });
  if (!user) throw notFound("User");
  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    // The frontend uses `role` to decide which view to show for each course.
    courses: user.memberships.map((m) => ({
      id: m.course.id,
      code: m.course.code,
      name: m.course.name,
      term: m.course.term,
      role: m.role,
    })),
  });
});

/** Student view: upcoming and past exams across all my courses, with my seat and check-in code. */
meRouter.get("/exams", async (req, res) => {
  // Every course where I'm a student, with its exams and my seat in each.
  const memberships = await prisma.courseMember.findMany({
    where: { userId: currentUser(req).id, status: "ACTIVE", role: "STUDENT" },
    include: {
      course: { include: { exams: { orderBy: { startsAt: "asc" } } } },
      assignments: { include: { seat: { include: { room: true } } } },
      checkIns: true,
    },
  });
  const exams = memberships.flatMap((m) =>
    m.course.exams.map((exam) => {
      // My seat for this exam, if seating has been generated.
      const a = m.assignments.find((x) => x.examId === exam.id);
      // My check-in for this exam, if I've been checked in.
      const c = m.checkIns.find((x) => x.examId === exam.id);
      return {
        id: exam.id,
        title: exam.title,
        startsAt: exam.startsAt,
        durationMinutes: exam.durationMinutes,
        course: { id: m.course.id, code: m.course.code, name: m.course.name },
        seat: a ? seatDto(a.seat) : null,
        room: a ? { id: a.seat.room.id, name: a.seat.room.name, building: a.seat.room.building } : null,
        checkinCode: a?.checkinCode ?? null,
        checkedInAt: c?.checkedInAt ?? null,
      };
    }),
  );
  // Mix exams from all courses into one list, soonest first.
  exams.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  res.json({ exams });
});
