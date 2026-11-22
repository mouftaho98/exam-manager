import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { unauthorized } from "./errors.js";

export type Role = "STUDENT" | "PROCTOR" | "INSTRUCTOR";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: string; role: Role }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: string; role: Role } {
  return jwt.verify(token, config.jwtSecret) as { userId: string; role: Role };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(unauthorized("Missing token"));
  }
  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    (req as Request & { user?: { userId: string; role: Role } }).user = payload;
    next();
  } catch {
    next(unauthorized("Invalid token"));
  }
}
