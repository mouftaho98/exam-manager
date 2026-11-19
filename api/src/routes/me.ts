import { Router } from "express";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { notFound } from "../errors.js";

export const meRouter = Router();

/** The signed-in user and every course they belong to, with their role in each. */
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    include: { memberships: { where: { status: "ACTIVE" }, include: { course: true } } },
  });
  if (!user) throw notFound("User");
  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    courses: user.memberships.map((m) => ({
      id: m.course.id,
      code: m.course.code,
      name: m.course.name,
      term: m.course.term,
      role: m.role,
    })),
  });
});
