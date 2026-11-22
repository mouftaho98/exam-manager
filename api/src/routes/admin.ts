/**
 * Admin tools (mounted at /admin, behind requireAuth). Admins only.
 *
 * Right now this is just approving instructors: anyone can ask to be an
 * instructor at sign-up, and an admin decides here.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { currentUser } from "../auth.js";
import { requireAdmin } from "../access.js";
import { notFound } from "../errors.js";
import { userDto } from "../serializers.js";

export const adminRouter = Router();

// Every route in this file is admins-only.
adminRouter.use(async (req, _res, next) => {
  await requireAdmin(currentUser(req).id);
  next();
});

/** Instructor requests, oldest first. ?status=PENDING (default), APPROVED or REJECTED. */
adminRouter.get("/instructor-requests", async (req, res) => {
  const status = z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING").parse(req.query.status);
  const users = await prisma.user.findMany({ where: { instructorStatus: status }, orderBy: { createdAt: "asc" } });
  res.json({ users: users.map(userDto) });
});

/** Approve or reject someone's instructor request. */
adminRouter.post("/instructor-requests/:userId/:decision", async (req, res) => {
  const decision = z.enum(["approve", "reject"]).parse(req.params.decision);
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) throw notFound("User");
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { instructorStatus: decision === "approve" ? "APPROVED" : "REJECTED" },
  });
  res.json({ user: userDto(updated) });
});
