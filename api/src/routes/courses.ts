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

function parseRosterCsv(text: string): { name: string; email: string; needsAccessible: boolean; needsLeftHanded: boolean }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const entries: { name: string; email: string; needsAccessible: boolean; needsLeftHanded: boolean }[] = [];
  let startIdx = 0;
  let hasHeader = false;
  let nameIdx = 0, emailIdx = 1, accIdx = -1, lhIdx = -1;
  if (lines.length > 0 && /name/i.test(lines[0]) && /email/i.test(lines[0])) {
    hasHeader = true;
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    nameIdx = headers.findIndex((h) => h.includes("name"));
    emailIdx = headers.findIndex((h) => h.includes("email"));
    accIdx = headers.findIndex((h) => h.includes("access"));
    lhIdx = headers.findIndex((h) => h.includes("left"));
    if (nameIdx < 0) nameIdx = 0;
    if (emailIdx < 0) emailIdx = 1;
    startIdx = 1;
  }
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const name = parts[nameIdx] || "";
    const email = parts[emailIdx] || (parts[0]?.includes("@") ? parts[0] : "");
    if (!email) continue;
    const needsAccessible = accIdx >= 0 ? /^(true|1|yes)$/i.test(parts[accIdx] || "") : false;
    const needsLeftHanded = lhIdx >= 0 ? /^(true|1|yes)$/i.test(parts[lhIdx] || "") : false;
    entries.push({ name: name || email.split("@")[0], email, needsAccessible, needsLeftHanded });
  }
  return entries;
}

router.post("/:id/roster", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
    });
    if (!course) throw notFound("Course");

    let entries: { name: string; email: string; needsAccessible?: boolean; needsLeftHanded?: boolean }[] = [];
    if (Array.isArray(req.body)) {
      entries = req.body.map((e: any) => ({
        name: String(e.name || ""),
        email: String(e.email || ""),
        needsAccessible: !!e.needsAccessible,
        needsLeftHanded: !!e.needsLeftHanded,
      })).filter((e) => e.email);
    } else if (typeof req.body === "string") {
      entries = parseRosterCsv(req.body);
    } else {
      throw badRequest("Send CSV text or JSON array of {name,email}");
    }
    if (entries.length === 0) throw badRequest("No valid entries found");

    let added = 0;
    for (const e of entries) {
      try {
        await prisma.courseRosterEntry.create({
          data: {
            courseId: course.id,
            name: e.name || e.email,
            email: e.email.toLowerCase(),
            needsAccessible: !!e.needsAccessible,
            needsLeftHanded: !!e.needsLeftHanded,
          },
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
    const { needsAccessible, needsLeftHanded, name, email } = req.body as { needsAccessible?: boolean; needsLeftHanded?: boolean; name?: string; email?: string };
    const updated = await prisma.courseRosterEntry.update({
      where: { id: entry.id },
      data: {
        ...(typeof needsAccessible === "boolean" ? { needsAccessible } : {}),
        ...(typeof needsLeftHanded === "boolean" ? { needsLeftHanded } : {}),
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof email === "string" && email.trim() ? { email: email.trim().toLowerCase() } : {}),
      },
    });
    res.json({ entry: updated });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/roster/:entryId", requireInstructor, async (req, res, next) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, instructorId: req.user.userId },
    });
    if (!course) throw notFound("Course");
    const entry = await prisma.courseRosterEntry.findFirst({
      where: { id: req.params.entryId, courseId: course.id },
    });
    if (!entry) throw notFound("Roster entry");
    await prisma.courseRosterEntry.delete({ where: { id: entry.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
