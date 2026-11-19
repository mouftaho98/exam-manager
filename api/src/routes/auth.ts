import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { conflict, unauthorized } from "../errors.js";

export const authRouter = Router();

const registerBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().trim().min(1).max(200),
});

const loginBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

const userDto = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

authRouter.post("/register", async (req, res) => {
  const body = registerBody.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw conflict("email_taken", "An account with this email already exists, please sign in");

  const user = await prisma.user.create({
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
  });
  res.status(201).json({ token: signToken(user), user: userDto(user) });
});

authRouter.post("/login", async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw unauthorized("Wrong email or password");
  }
  res.json({ token: signToken(user), user: userDto(user) });
});
