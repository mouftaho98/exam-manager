/**
 * Courses and their members (mounted at /courses, behind requireAuth).
 *
 * Who can do what:
 * - any member can view the course
 * - staff (instructors and proctors) can list members
 * - only instructors can change the course, invite people or upload a roster
 */
import { Router } from "express";
import { z } from "zod";
import type { CourseMember } from "@prisma/client";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { INSTRUCTOR_ONLY, STAFF, requireCourseRole } from "../access.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { newInviteToken } from "../codes.js";
import { parseRoster, type RosterError } from "../roster.js";
import { inviteUrl, memberDto } from "../serializers.js";

export const coursesRouter = Router();

// ---- Request body shapes (validated with Zod) ----

const courseBody = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  term: z.string().trim().max(50).optional(),
});

// Optional details about a member, shared by "add" and "update".
const memberFields = {
  studentNumber: z.string().trim().min(1).max(50).optional(),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  needsAccessible: z.boolean().optional(),
  leftHanded: z.boolean().optional(),
};

const addMemberBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: z.enum(["INSTRUCTOR", "PROCTOR", "STUDENT"]),
  ...memberFields,
});

const updateMemberBody = z.object({
  role: z.enum(["INSTRUCTOR", "PROCTOR", "STUDENT"]).optional(),
  ...memberFields,
});

// ---- Courses ----

/** Create a course. The creator automatically becomes its first instructor. */
coursesRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const body = courseBody.parse(req.body);
  const course = await prisma.course.create({
    data: {
      ...body,
      members: {
        create: { userId: user.id, email: user.email, role: "INSTRUCTOR", status: "ACTIVE", joinedAt: new Date() },
      },
    },
  });
  res.status(201).json({ course, myRole: "INSTRUCTOR" });
});

/** One course, the caller's role in it, and how many members of each role it has. */
coursesRouter.get("/:courseId", async (req, res) => {
  const me = await requireCourseRole(currentUser(req).id, req.params.courseId);
  const course = await prisma.course.findUniqueOrThrow({ where: { id: req.params.courseId } });
  const counts = await prisma.courseMember.groupBy({
    by: ["role"],
    where: { courseId: course.id },
    _count: true,
  });
  res.json({
    course,
    myRole: me.role,
    memberCounts: Object.fromEntries(counts.map((c) => [c.role, c._count])),
  });
});

/** Rename / edit a course. Instructors only. */
coursesRouter.patch("/:courseId", async (req, res) => {
  await requireCourseRole(currentUser(req).id, req.params.courseId, INSTRUCTOR_ONLY);
  const course = await prisma.course.update({
    where: { id: req.params.courseId },
    data: courseBody.partial().parse(req.body),
  });
  res.json({ course });
});

/** Delete a course and everything in it. Instructors only. */
coursesRouter.delete("/:courseId", async (req, res) => {
  await requireCourseRole(currentUser(req).id, req.params.courseId, INSTRUCTOR_ONLY);
  await prisma.course.delete({ where: { id: req.params.courseId } });
  res.status(204).end();
});

// ---- Members ----

/** List members, optionally filtered with ?role=STUDENT. Staff only. */
coursesRouter.get("/:courseId/members", async (req, res) => {
  const me = await requireCourseRole(currentUser(req).id, req.params.courseId, STAFF);
  const role = z.enum(["INSTRUCTOR", "PROCTOR", "STUDENT"]).optional().parse(req.query.role);
  const members = await prisma.courseMember.findMany({
    where: { courseId: req.params.courseId, ...(role ? { role } : {}) },
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { email: "asc" }],
  });
  // Proctors can see the list, but only instructors get the invite links.
  res.json({ members: members.map((m) => memberDto(m, { includeInvite: me.role === "INSTRUCTOR" })) });
});

// Invite one person (student, proctor or co-instructor) to the course.
coursesRouter.post("/:courseId/members", async (req, res) => {
  const courseId = req.params.courseId;
  await requireCourseRole(currentUser(req).id, courseId, INSTRUCTOR_ONLY);
  const body = addMemberBody.parse(req.body);
  const existing = await prisma.courseMember.findUnique({ where: { courseId_email: { courseId, email: body.email } } });
  if (existing) throw conflict("already_member", `${body.email} is already in this course`);

  const member = await prisma.courseMember.create({
    data: { ...body, courseId, inviteToken: newInviteToken() },
  });
  res.status(201).json({ member: memberDto(member, { includeInvite: true }) });
});

/**
 * Upload a roster as CSV (Content-Type: text/csv). Students are added or
 * updated by email; nobody is removed. Each new student gets an invite link.
 */
coursesRouter.post("/:courseId/roster", async (req, res) => {
  const courseId = req.params.courseId;
  await requireCourseRole(currentUser(req).id, courseId, INSTRUCTOR_ONLY);
  if (typeof req.body !== "string" || !req.body.trim()) {
    throw badRequest("Send the roster as CSV text with Content-Type: text/csv");
  }
  const { rows, errors } = parseRoster(req.body);

  // Load everyone already in the course, to tell new students from updates.

  const existing = await prisma.courseMember.findMany({ where: { courseId } });
  const byEmail = new Map(existing.map((m) => [m.email, m]));
  const byNumber = new Map(existing.filter((m) => m.studentNumber).map((m) => [m.studentNumber!, m]));

  // Sort each row into "create", "update" or "error" before touching the database.
  const rowErrors: RosterError[] = [...errors];
  const toCreate: Parameters<typeof prisma.courseMember.create>[0]["data"][] = [];
  const toUpdate: { id: string; data: Partial<CourseMember> }[] = [];

  for (const row of rows) {
    const current = byEmail.get(row.email);
    const numberOwner = row.studentNumber ? byNumber.get(row.studentNumber) : undefined;
    // The student number is already used by someone with a different email.
    if (numberOwner && numberOwner.email !== row.email) {
      rowErrors.push({ line: row.line, message: `Student number ${row.studentNumber} already belongs to ${numberOwner.email}` });
      continue;
    }
    const fields = {
      studentNumber: row.studentNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      needsAccessible: row.needsAccessible,
      leftHanded: row.leftHanded,
    };
    if (!current) {
      // New to the course: add them as an invited student.
      toCreate.push({ ...fields, courseId, email: row.email, role: "STUDENT", inviteToken: newInviteToken() });
    } else if (current.role !== "STUDENT") {
      // Don't turn a proctor or instructor into a student by accident.
      rowErrors.push({ line: row.line, message: `${row.email} is already in this course as ${current.role.toLowerCase()}` });
    } else {
      // Already a student: update their details (name, accessibility, ...).
      toUpdate.push({ id: current.id, data: fields });
    }
  }

  // All-or-nothing: if any write fails, none of the roster changes are saved.
  const created = await prisma.$transaction(async (tx) => {
    for (const u of toUpdate) await tx.courseMember.update({ where: { id: u.id }, data: u.data });
    const result: CourseMember[] = [];
    for (const data of toCreate) result.push(await tx.courseMember.create({ data }));
    return result;
  });

  res.json({
    created: created.length,
    updated: toUpdate.length,
    errors: rowErrors.sort((a, b) => a.line - b.line),
    // Invite links for the new students, so the instructor can send them out.
    invites: created.map((m) => ({ email: m.email, inviteUrl: inviteUrl(m.inviteToken!) })),
  });
});

/** Change a member's role or details. Instructors only. */
coursesRouter.patch("/:courseId/members/:memberId", async (req, res) => {
  const { courseId, memberId } = req.params;
  await requireCourseRole(currentUser(req).id, courseId, INSTRUCTOR_ONLY);
  const body = updateMemberBody.parse(req.body);
  const member = await prisma.courseMember.findFirst({ where: { id: memberId, courseId } });
  if (!member) throw notFound("Member");
  // Demoting an instructor is fine unless they're the only one left.
  if (member.role === "INSTRUCTOR" && body.role && body.role !== "INSTRUCTOR") await assertNotLastInstructor(member);
  const updated = await prisma.courseMember.update({ where: { id: memberId }, data: body });
  res.json({ member: memberDto(updated, { includeInvite: true }) });
});

/** Remove someone from the course. Instructors only. */
coursesRouter.delete("/:courseId/members/:memberId", async (req, res) => {
  const { courseId, memberId } = req.params;
  await requireCourseRole(currentUser(req).id, courseId, INSTRUCTOR_ONLY);
  const member = await prisma.courseMember.findFirst({ where: { id: memberId, courseId } });
  if (!member) throw notFound("Member");
  if (member.role === "INSTRUCTOR") await assertNotLastInstructor(member);
  await prisma.courseMember.delete({ where: { id: memberId } });
  res.status(204).end();
});

// Make a fresh invite link (e.g. the old one was lost). Old link stops working.
coursesRouter.post("/:courseId/members/:memberId/invite", async (req, res) => {
  const { courseId, memberId } = req.params;
  await requireCourseRole(currentUser(req).id, courseId, INSTRUCTOR_ONLY);
  const member = await prisma.courseMember.findFirst({ where: { id: memberId, courseId } });
  if (!member) throw notFound("Member");
  if (member.status === "ACTIVE") throw conflict("already_joined", "This person has already joined the course");
  const updated = await prisma.courseMember.update({ where: { id: memberId }, data: { inviteToken: newInviteToken() } });
  res.json({ member: memberDto(updated, { includeInvite: true }) });
});

/** Throw 409 if removing or demoting this instructor would leave the course with none. */
async function assertNotLastInstructor(member: CourseMember) {
  const others = await prisma.courseMember.count({
    where: { courseId: member.courseId, role: "INSTRUCTOR", status: "ACTIVE", NOT: { id: member.id } },
  });
  if (others === 0) throw conflict("last_instructor", "A course needs at least one active instructor");
}
