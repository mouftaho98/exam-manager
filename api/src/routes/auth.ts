import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, conflict, unauthorized } from "../errors.js";
import { hashPassword, verifyPassword, signToken, requireAuth, type Role } from "../auth.js";

const router = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["STUDENT", "PROCTOR", "INSTRUCTOR"]),
});

router.post("/signup", async (req, res, next) => {
  try {
    const data = signupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw conflict("email_exists", "Email already registered");
    }
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role as Role,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    const token = signToken({ userId: user.id, role: user.role as Role });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) {
      throw unauthorized("Invalid email or password");
    }
    const token = signToken({ userId: user.id, role: user.role as Role });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userId = (req as { user?: { userId: string } }).user?.userId;
    if (!userId) throw unauthorized();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!user) throw unauthorized("User not found");
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
