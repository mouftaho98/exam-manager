import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../auth.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { memberDto } from "../serializers.js";

// Invite flow (an invite is to one course):
// 1. GET /invites/:token tells the web app which course it is and whether the
//    invited email already has an account (show "sign in" or "create account").
// 2. The person signs in or registers with that email.
// 3. POST /invites/:token/accept links the course membership to their account.
export const invitesRouter = Router();

invitesRouter.get("/:token", async (req, res) => {
  const member = await prisma.courseMember.findUnique({
    where: { inviteToken: req.params.token },
    include: { course: true },
  });
  if (!member) throw notFound("Invite");
  const account = await prisma.user.findUnique({ where: { email: member.email }, select: { id: true } });
  res.json({
    email: member.email,
    role: member.role,
    course: { id: member.course.id, code: member.course.code, name: member.course.name, term: member.course.term },
    accountExists: Boolean(account),
  });
});

invitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const member = await prisma.courseMember.findUnique({ where: { inviteToken: String(req.params.token) } });
  if (!member) throw notFound("Invite");
  // The invite is for a specific email; the account must use the same one.
  if (member.email !== user.email.toLowerCase()) {
    throw forbidden(`This invite is for ${member.email}. Sign in with that email to accept it.`);
  }
  const alreadyIn = await prisma.courseMember.findFirst({
    where: { courseId: member.courseId, userId: user.id, NOT: { id: member.id } },
  });
  if (alreadyIn) throw conflict("already_member", "You are already a member of this course");

  const updated = await prisma.courseMember.update({
    where: { id: member.id },
    data: { userId: user.id, status: "ACTIVE", inviteToken: null, joinedAt: new Date() },
  });
  res.json({ courseId: updated.courseId, member: memberDto(updated) });
});
