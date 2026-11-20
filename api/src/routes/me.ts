/**
 * The signed-in user's own data (mounted at /me, behind requireAuth).
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { conflict, notFound } from "../errors.js";
import { offeringDto, userDto } from "../serializers.js";

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

/** Ask to become an instructor (e.g. didn't tick it at sign-up, or was rejected before). */
meRouter.post("/instructor-request", async (req, res) => {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (me.instructorStatus === "APPROVED") throw conflict("already_instructor", "You are already an approved instructor");
  const user = await prisma.user.update({ where: { id: me.id }, data: { instructorStatus: "PENDING" } });
  res.json({ user: userDto(user) });
});

/** Update my own name. */
meRouter.patch("/", async (req, res) => {
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data: updateMeBody.parse(req.body),
  });
  res.json({ user: userDto(user) });
});
