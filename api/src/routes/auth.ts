/**
 * Accounts: POST /auth/register and POST /auth/login.
 * Both return a login token and the user. These routes are public.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { conflict, unauthorized } from "../errors.js";

export const authRouter = Router();

// Request body shapes. Zod checks them and throws a 400 if they're wrong.
// Emails are lowercased so "Ana@Mail.com" and "ana@mail.com" are the same account.
const registerBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().trim().min(1).max(200),
});

const loginBody = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

// What we send back about a user. Never includes the password hash.
const userDto = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

/** Create an account. 409 if the email is already registered. */
authRouter.post("/register", async (req, res) => {
  const body = registerBody.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw conflict("email_taken", "An account with this email already exists, please sign in");

  const user = await prisma.user.create({
    // Store a bcrypt hash (cost 10), never the plain password.
    data: { email: body.email, name: body.name, passwordHash: await bcrypt.hash(body.password, 10) },
  });
  res.status(201).json({ token: signToken(user), user: userDto(user) });
});

/** Sign in with email and password. */
authRouter.post("/login", async (req, res) => {
  const body = loginBody.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  // Same message for "no such user" and "wrong password", so emails can't be probed.
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw unauthorized("Wrong email or password");
  }
  res.json({ token: signToken(user), user: userDto(user) });
});
