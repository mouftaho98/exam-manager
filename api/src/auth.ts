/**
 * Login tokens (JWT) and the middleware that checks them.
 *
 * After register or login, the client gets a token and sends it on every
 * request as `Authorization: Bearer <token>`. The token is signed with
 * JWT_SECRET, so the server can trust the user id inside it without a
 * database lookup.
 */
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { unauthorized } from "./errors.js";

/** Who is making the request, taken from their token. */
export interface AuthUser {
  id: string;
  email: string;
}

// Tell TypeScript that Express requests can carry `req.user` (set by requireAuth).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Make a login token for a user. It expires after JWT_EXPIRES_IN (default 7 days). */
export function signToken(user: AuthUser): string {
  return jwt.sign({ email: user.email }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/** Check a token's signature and expiry, and return the user inside it. Throws if invalid. */
export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  if (!payload.sub || typeof payload.email !== "string") throw new Error("Bad token");
  return { id: payload.sub, email: payload.email };
}

/**
 * Middleware: only let signed-in users through. Puts the user on `req.user`,
 * or answers 401 if the token is missing, expired or forged.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());
  try {
    req.user = verifyToken(header.slice(7)); // strip the "Bearer " prefix
    next();
  } catch {
    next(unauthorized("Session expired or invalid, please sign in again"));
  }
};

/** The signed-in user. Only call after requireAuth. */
export function currentUser(req: Express.Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
