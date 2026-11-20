/**
 * Offering invites: look one up, and accept it.
 *
 * Invite flow (an invite is to one offering, e.g. ECE1779 Fall 2026):
 * 1. GET /invites/:token tells the web app which offering it is and whether the
 *    invited email already has an account (show "sign in" or "create account").
 * 2. The person signs in or registers with that email.
 * 3. POST /invites/:token/accept makes their membership ACTIVE.
 */
import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser, requireAuth } from "../auth.js";
import { forbidden, notFound } from "../errors.js";
import { memberDto, offeringDto } from "../serializers.js";

export const invitesRouter = Router();

/** Step 1: what is this invite for? Public, so it works before the person signs in. */
invitesRouter.get("/:token", async (req, res) => {
  const member = await prisma.offeringMember.findUnique({
    where: { inviteToken: req.params.token },
    include: { user: true, offering: { include: { course: true } } },
  });
  if (!member) throw notFound("Invite");
  res.json({
    email: member.user.email,
    role: member.role,
    offering: offeringDto(member.offering),
    // Lets the web app show "sign in" or "create account".
    accountExists: member.user.passwordHash !== null,
  });
});

/** Step 3: join the offering. Requires being signed in with the invited email. */
invitesRouter.post("/:token/accept", requireAuth, async (req, res) => {
  const user = currentUser(req);
  const member = await prisma.offeringMember.findUnique({
    where: { inviteToken: String(req.params.token) },
    include: { user: true },
  });
  if (!member) throw notFound("Invite");
  // The invite was made for one specific person (by email); it must be them.
  if (member.userId !== user.id) {
    throw forbidden(`This invite is for ${member.user.email}. Sign in with that email to accept it.`);
  }
  const updated = await prisma.offeringMember.update({
    where: { id: member.id },
    // Clear the token, so the link can't be used again.
    data: { status: "ACTIVE", inviteToken: null, joinedAt: new Date() },
    include: { user: true },
  });
  res.json({ offeringId: updated.offeringId, member: memberDto(updated) });
});
