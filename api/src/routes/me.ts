/**
 * The signed-in user's own data (mounted at /me, behind requireAuth).
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { notFound } from "../errors.js";
import { offeringDto, seatDto, userDto } from "../serializers.js";

export const meRouter = Router();

// People can change their own name. Accessibility settings are set by instructors.
const updateMeBody = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
});

/** The signed-in user and every offering they belong to, with their role in each. */
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    // Only offerings they've joined, not pending invites.
    include: { memberships: { where: { status: "ACTIVE" }, include: { offering: { include: { course: true } } } } },
  });
  if (!user) throw notFound("User");
  res.json({
    user: userDto(user),
    // The frontend uses `role` to decide which view to show for each offering.
    offerings: user.memberships.map((m) => ({ ...offeringDto(m.offering), role: m.role })),
  });
});

/** Update my own name. */
meRouter.patch("/", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data: updateMeBody.parse(req.body),
  });
  res.json({ user: userDto(user) });
});

/** Student view: upcoming and past exams across all my offerings, with my seat and check-in code. */
meRouter.get("/exams", async (req, res) => {
  // Every offering where I'm a student, with its exams and my seat in each.
  const memberships = await prisma.offeringMember.findMany({
    where: { userId: currentUser(req).id, status: "ACTIVE", role: "STUDENT" },
    include: {
      offering: { include: { course: true, exams: { orderBy: { startsAt: "asc" } } } },
      assignments: { include: { seat: { include: { room: true } } } },
    },
  });
  const exams = memberships.flatMap((m) =>
    m.offering.exams.map((exam) => {
      // My seat for this exam, if seating has been generated.
      const a = m.assignments.find((x) => x.examId === exam.id);
      return {
        id: exam.id,
        title: exam.title,
        startsAt: exam.startsAt,
        durationMinutes: exam.durationMinutes,
        offering: offeringDto(m.offering),
        seat: a ? seatDto(a.seat) : null,
        room: a ? { id: a.seat.room.id, name: a.seat.room.name, building: a.seat.room.building } : null,
        checkinCode: a?.checkinCode ?? null,
      };
    }),
  );
  // Mix exams from all offerings into one list, soonest first.
  exams.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  res.json({ exams });
});
