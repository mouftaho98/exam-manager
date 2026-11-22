import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { badRequest, forbidden, notFound } from "../errors.js";

const router = Router();

router.use(requireAuth);

function requireInstructor(req: any, res: any, next: any) {
  if (req.user?.role !== "INSTRUCTOR") {
    return next(forbidden("Instructor role required"));
  }
  next();
}

const createCourseSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

router.post("/", requireInstructor, async (req, res, next) => {
  try {
    const data = createCourseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        code: data.code,
        name: data.name,
        instructorId: req.user.userId,
      },
    });
    res.status(201).json({ course });
  } catch (err) {
    next(err);
  }
});

router.get("/", requireInstructor, async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: { instructorId: req.user.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ courses });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
      include: { _count: { select: { roster: true } } },
    });
    if (!course) throw notFound("Course");
    res.json({ course });
  } catch (err) {
    next(err);
  }
});

// Simple CSV parser: expects lines of "name,email" (or header row with name,email)
function parseRosterCsv(text: string): { name: string; email: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: { name: string; email: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip header
    if (i === 0 && /name/i.test(line) && /email/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length >= 2) {
      // assume name,email
      entries.push({ name: parts[0], email: parts[1] });
    } else if (parts.length === 1 && parts[0].includes("@")) {
      entries.push({ name: parts[0].split("@")[0], email: parts[0] });
    }
  }
  return entries;
}

router.post("/:id/roster", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
    });
    if (!course) throw notFound("Course");

    let entries: { name: string; email: string }[] = [];
    if (Array.isArray(req.body)) {
      entries = req.body.map((e: any) => ({ name: String(e.name || ""), email: String(e.email || "") })).filter((e) => e.email);
    } else if (typeof req.body === "string") {
      entries = parseRosterCsv(req.body);
    } else {
      throw badRequest("Send CSV text or JSON array of {name,email}");
    }
    if (entries.length === 0) throw badRequest("No valid entries found");

    // Upsert-like: create many, skip duplicates by unique constraint handling
    let added = 0;
    for (const e of entries) {
      try {
        await prisma.courseRosterEntry.create({
          data: { courseId: course.id, name: e.name || e.email, email: e.email.toLowerCase() },
        });
        added++;
      } catch {
        // skip duplicates
      }
    }
    res.json({ added, total: entries.length });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/roster", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
    });
    if (!course) throw notFound("Course");
    const roster = await prisma.courseRosterEntry.findMany({
      where: { courseId: course.id },
      orderBy: { name: "asc" },
    });
    res.json({ roster });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/roster/:entryId", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
    });
    if (!course) throw notFound("Course");
    const entry = await prisma.courseRosterEntry.findFirst({
      where: { id: req.params.entryId, courseId: course.id },
    });
    if (!entry) throw notFound("Roster entry");
    const { needsAccessible, needsLeftHanded } = req.body as { needsAccessible?: boolean; needsLeftHanded?: boolean };
    const updated = await prisma.courseRosterEntry.update({
      where: { id: entry.id },
      data: {
        ...(typeof needsAccessible === "boolean" ? { needsAccessible } : {}),
        ...(typeof needsLeftHanded === "boolean" ? { needsLeftHanded } : {}),
      },
    });
    res.json({ entry: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
