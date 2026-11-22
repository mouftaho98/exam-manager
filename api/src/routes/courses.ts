/**
 * The course catalog (mounted at /courses, behind requireAuth).
 *
 * A course (ECE1779 Cloud Computing) is shared by all its offerings. Any
 * signed-in user can look courses up; only approved instructors can add a
 * course or start an offering. Each term's
 * students, staff and exams live on an Offering (routes/offerings.ts).
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { requireApprovedInstructor } from "../access.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { offeringDto } from "../serializers.js";

export const coursesRouter = Router();

// ---- Request body shapes (validated with Zod) ----

const courseBody = z.object({
  // Stored uppercase without spaces, so "ece 1779" and "ECE1779" are the same course.
  code: z.string().trim().min(1).max(50).transform((c) => c.toUpperCase().replace(/\s+/g, "")),
  name: z.string().trim().min(1).max(200),
});

const offeringBody = z.object({
  year: z.number().int().min(2000).max(2100),
  semester: z.enum(["WINTER", "SUMMER", "FALL"]),
});

const courseDto = (c: { id: string; code: string; name: string }) => ({ id: c.id, code: c.code, name: c.name });

/** Add a course to the catalog. Approved instructors only. 409 `course_exists` (with its id) if the code is taken. */
coursesRouter.post("/", async (req, res) => {
  await requireApprovedInstructor(currentUser(req).id);
  const body = courseBody.parse(req.body);
  const existing = await prisma.course.findUnique({ where: { code: body.code } });
  if (existing) throw conflict("course_exists", `${body.code} already exists`, { courseId: existing.id });
  const course = await prisma.course.create({ data: { ...body, createdById: currentUser(req).id } });
  res.status(201).json({ course: courseDto(course) });
});

/** Search the catalog by code or name with ?q=. */
coursesRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const courses = await prisma.course.findMany({
    where: q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { code: "asc" },
    take: 50,
  });
  res.json({ courses: courses.map(courseDto) });
});

/** One course and its offerings, newest first, with my role in each (null if I'm not in it). */
coursesRouter.get("/:courseId", async (req, res) => {
  const userId = currentUser(req).id;
  const course = await prisma.course.findUnique({
    where: { id: req.params.courseId },
    include: {
      offerings: {
        orderBy: [{ year: "desc" }, { semester: "desc" }],
        include: { members: { where: { userId, status: "ACTIVE" } } },
      },
    },
  });
  if (!course) throw notFound("Course");
  res.json({
    course: courseDto(course),
    offerings: course.offerings.map((o) => ({ ...offeringDto({ ...o, course }), myRole: o.members[0]?.role ?? null })),
  });
});

/** Rename a course. Allowed for whoever added it, or an instructor of any of its offerings. */
coursesRouter.patch("/:courseId", async (req, res) => {
  const userId = currentUser(req).id;
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
  if (!course) throw notFound("Course");
  const teachesIt = await prisma.offeringMember.findFirst({
    where: { userId, role: "INSTRUCTOR", status: "ACTIVE", offering: { courseId: course.id } },
  });
  if (course.createdById !== userId && !teachesIt) throw forbidden("Only the course's instructors can rename it");
  const updated = await prisma.course.update({
    where: { id: course.id },
    data: courseBody.pick({ name: true }).parse(req.body),
  });
  res.json({ course: courseDto(updated) });
});

/** Start a new offering (term) of a course. Approved instructors only; the creator becomes its instructor. */
coursesRouter.post("/:courseId/offerings", async (req, res) => {
  const user = currentUser(req);
  await requireApprovedInstructor(user.id);
  const body = offeringBody.parse(req.body);
  const course = await prisma.course.findUnique({ where: { id: req.params.courseId } });
  if (!course) throw notFound("Course");
  const existing = await prisma.offering.findUnique({
    where: { courseId_year_semester: { courseId: course.id, ...body } },
  });
  if (existing) throw conflict("offering_exists", "This course already has an offering that term", { offeringId: existing.id });
  const offering = await prisma.offering.create({
    data: {
      ...body,
      courseId: course.id,
      members: { create: { userId: user.id, role: "INSTRUCTOR", status: "ACTIVE", joinedAt: new Date() } },
    },
    include: { course: true },
  });
  res.status(201).json({ offering: offeringDto(offering), myRole: "INSTRUCTOR" });
});
