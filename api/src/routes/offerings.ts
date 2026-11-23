/**
 * Offerings and their members (mounted at /offerings, behind requireAuth).
 * An offering is one term of a course, e.g. ECE1779 Fall 2026.
 *
 * Who can do what:
 * - any member can view the offering
 * - staff (instructors and proctors) can list members
 * - only instructors can change the offering, invite people or upload a roster
 *
 * Whoever starts the offering is its first instructor. Instructors invite
 * students, proctors or co-instructors and pick the role for each; students
 * are also invited automatically by the roster upload.
 */
import { Router } from "express";
import { z } from "zod";
import type { OfferingMember } from "@prisma/client";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { INSTRUCTOR_ONLY, STAFF, requireOfferingRole } from "../access.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newInviteToken } from "../codes.js";
import { upsertPerson } from "../people.js";
import { parseRoster, type RosterError } from "../roster.js";
import { inviteUrl, memberDto, offeringDto } from "../serializers.js";

export const offeringsRouter = Router();

// ---- Request body shapes (validated with Zod) ----

const offeringBody = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.enum(["WINTER", "SUMMER", "FALL"]),
});

const roleSchema = z.enum(["INSTRUCTOR", "PROCTOR", "STUDENT"]);

// Optional details about the person, shared by "add" and "update".
// These are saved on the User (see people.ts for the rules).
const personFields = {
  studentNumber: z.string().trim().min(1).max(50).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
};

const addMemberBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: roleSchema,
  ...personFields,
});

// Instructors can also set a person's seating needs, for when a student asks
// them to (students normally set these themselves). Needs belong to the
// person, so the change applies in all their offerings.
const updateMemberBody = z.object({
  role: roleSchema.optional(),
  ...personFields,
  needsAccessible: z.boolean().optional(),
  leftHanded: z.boolean().optional(),
});

// ---- Offerings ----

/** One offering, the caller's role in it, and how many members of each role it has. */
offeringsRouter.get("/:offeringId", async (req, res) => {
  const me = await requireOfferingRole(currentUser(req).id, req.params.offeringId);
  const offering = await prisma.offering.findUniqueOrThrow({
    where: { id: req.params.offeringId },
    include: { course: true },
  });
  const counts = await prisma.offeringMember.groupBy({
    by: ["role"],
    where: { offeringId: offering.id },
    _count: true,
  });
  res.json({
    offering: offeringDto(offering),
    myRole: me.role,
    memberCounts: Object.fromEntries(counts.map((c) => [c.role, c._count])),
  });
});

/** Change the year or semester. Instructors only. */
offeringsRouter.patch("/:offeringId", async (req, res) => {
  await requireOfferingRole(currentUser(req).id, req.params.offeringId, INSTRUCTOR_ONLY);
  const offering = await prisma.offering.update({
    where: { id: req.params.offeringId },
    data: offeringBody.partial().parse(req.body),
    include: { course: true },
  });
  res.json({ offering: offeringDto(offering) });
});

/** Delete an offering and everything in it. The course stays in the catalog. Instructors only. */
offeringsRouter.delete("/:offeringId", async (req, res) => {
  await requireOfferingRole(currentUser(req).id, req.params.offeringId, INSTRUCTOR_ONLY);
  await prisma.offering.delete({ where: { id: req.params.offeringId } });
  res.status(204).end();
});

// ---- Members ----

/** List members, optionally filtered with ?role=STUDENT. Staff only. */
offeringsRouter.get("/:offeringId/members", async (req, res) => {
  const me = await requireOfferingRole(currentUser(req).id, req.params.offeringId, STAFF);
  const role = roleSchema.optional().parse(req.query.role);
  const members = await prisma.offeringMember.findMany({
    where: { offeringId: req.params.offeringId, ...(role ? { role } : {}) },
    include: { user: true },
    orderBy: [{ role: "asc" }, { user: { lastName: "asc" } }, { user: { email: "asc" } }],
  });
  // Proctors can see the list, but only instructors get the invite links.
  res.json({ members: members.map((m) => memberDto(m, { includeInvite: me.role === "INSTRUCTOR" })) });
});

/** Invite one person as a student, proctor or co-instructor. They don't need an account yet. */
offeringsRouter.post("/:offeringId/members", async (req, res) => {
  const offeringId = req.params.offeringId;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  const { role, ...person } = addMemberBody.parse(req.body);

  const member = await prisma.$transaction(async (tx) => {
    const result = await upsertPerson(tx, person);
    if ("error" in result) throw badRequest(result.error);
    const existing = await tx.offeringMember.findUnique({
      where: { offeringId_userId: { offeringId, userId: result.user.id } },
    });
    if (existing) throw conflict("already_member", `${person.email} is already in this offering`);
    return tx.offeringMember.create({
      data: { offeringId, userId: result.user.id, role, inviteToken: newInviteToken() },
      include: { user: true },
    });
  });
  res.status(201).json({ member: memberDto(member, { includeInvite: true }) });
});

/**
 * Upload a roster as CSV (Content-Type: text/csv). Students are added or
 * updated by email; nobody is removed. Each new student gets an invite link.
 */
offeringsRouter.post("/:offeringId/roster", async (req, res) => {
  const offeringId = req.params.offeringId;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  if (typeof req.body !== "string" || !req.body.trim()) {
    throw badRequest("Send the roster as CSV text with Content-Type: text/csv");
  }
  const { rows, errors } = parseRoster(req.body);
  const rowErrors: RosterError[] = [...errors];

  // All-or-nothing: if a database write fails, none of the roster changes are saved.
  // Problems with a single row (e.g. a clashing student number) are reported, not thrown.
  const { created, updated } = await prisma.$transaction(
    async (tx) => {
      const created: (OfferingMember & { user: { email: string } })[] = [];
      let updated = 0;
      for (const { line, ...person } of rows) {
        // Create or update the person (name, student number).
        const result = await upsertPerson(tx, person);
        if ("error" in result) {
          rowErrors.push({ line, message: result.error });
          continue;
        }
        const member = await tx.offeringMember.findUnique({
          where: { offeringId_userId: { offeringId, userId: result.user.id } },
        });
        if (!member) {
          // New to the offering: add them as an invited student.
          created.push(
            await tx.offeringMember.create({
              data: { offeringId, userId: result.user.id, role: "STUDENT", inviteToken: newInviteToken() },
              include: { user: { select: { email: true } } },
            }),
          );
        } else if (member.role !== "STUDENT") {
          // Don't turn a proctor or instructor into a student by accident.
          rowErrors.push({ line, message: `${person.email} is already in this offering as ${member.role.toLowerCase()}` });
        } else {
          // Already a student: their details were updated above.
          updated++;
        }
      }
      return { created, updated };
    },
    { timeout: 30000 },
  );

  res.json({
    created: created.length,
    updated,
    errors: rowErrors.sort((a, b) => a.line - b.line),
    // Invite links for the new students, so the instructor can send them out.
    invites: created.map((m) => ({ email: m.user.email, inviteUrl: inviteUrl(m.inviteToken!) })),
  });
});

/** Change a member's role, person details or seating needs. Instructors only. */
offeringsRouter.patch("/:offeringId/members/:memberId", async (req, res) => {
  const { offeringId, memberId } = req.params;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  const { role, needsAccessible, leftHanded, ...person } = updateMemberBody.parse(req.body);
  const member = await prisma.offeringMember.findFirst({ where: { id: memberId, offeringId }, include: { user: true } });
  if (!member) throw notFound("Member");
  // Demoting an instructor is fine unless they're the only one left.
  if (member.role === "INSTRUCTOR" && role && role !== "INSTRUCTOR") await assertNotLastInstructor(member);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await upsertPerson(tx, { ...person, email: member.user.email });
    if ("error" in result) throw badRequest(result.error);
    if (needsAccessible !== undefined || leftHanded !== undefined) {
      await tx.user.update({ where: { id: member.userId }, data: { needsAccessible, leftHanded } });
    }
    return tx.offeringMember.update({ where: { id: memberId }, data: { role }, include: { user: true } });
  });
  res.json({ member: memberDto(updated, { includeInvite: true }) });
});

/** Remove someone from the offering. Their account stays. Instructors only. */
offeringsRouter.delete("/:offeringId/members/:memberId", async (req, res) => {
  const { offeringId, memberId } = req.params;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  const member = await prisma.offeringMember.findFirst({ where: { id: memberId, offeringId } });
  if (!member) throw notFound("Member");
  if (member.role === "INSTRUCTOR") await assertNotLastInstructor(member);
  await prisma.offeringMember.delete({ where: { id: memberId } });
  res.status(204).end();
});

// Make a fresh invite link (e.g. the old one was lost). Old link stops working.
offeringsRouter.post("/:offeringId/members/:memberId/invite", async (req, res) => {
  const { offeringId, memberId } = req.params;
  await requireOfferingRole(currentUser(req).id, offeringId, INSTRUCTOR_ONLY);
  const member = await prisma.offeringMember.findFirst({ where: { id: memberId, offeringId } });
  if (!member) throw notFound("Member");
  if (member.status === "ACTIVE") throw conflict("already_joined", "This person has already joined the offering");
  const updated = await prisma.offeringMember.update({
    where: { id: memberId },
    data: { inviteToken: newInviteToken() },
    include: { user: true },
  });
  res.json({ member: memberDto(updated, { includeInvite: true }) });
});

/** Throw 409 if removing or demoting this instructor would leave the offering with none. */
async function assertNotLastInstructor(member: OfferingMember) {
  const others = await prisma.offeringMember.count({
    where: { offeringId: member.offeringId, role: "INSTRUCTOR", status: "ACTIVE", NOT: { id: member.id } },
  });
  if (others === 0) throw conflict("last_instructor", "An offering needs at least one active instructor");
}
