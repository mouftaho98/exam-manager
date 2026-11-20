/**
 * Error types and the handler that turns errors into JSON responses.
 *
 * Route code throws an HttpError (usually through one of the helpers below)
 * and doesn't build error responses itself. errorHandler, registered last in
 * app.ts, catches everything and replies in one consistent shape:
 *
 *   { "error": { "code": "not_found", "message": "Exam not found", "details": ... } }
 *
 * The frontend should switch on `code`, which is stable. `message` is for humans.
 */
import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

/** An error that knows which HTTP status and error code to send back. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Shortcuts for the common cases, e.g. `throw notFound("Exam")`.

/** 400: the request itself is wrong. */
export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
/** 401: no valid login token was sent. */
export const unauthorized = (message = "Not signed in") => new HttpError(401, "unauthorized", message);
/** 403: signed in, but not allowed to do this. */
export const forbidden = (message = "You do not have access to this") =>
  new HttpError(403, "forbidden", message);
/** 404: the thing doesn't exist (or the user isn't allowed to know it exists). */
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);
/** 409: the request clashes with the current state, e.g. a seat that's already taken. */
export const conflict = (code: string, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

// Every error response has the shape { error: { code, message, details? } }.
// Express knows this is an error handler because it takes 4 arguments.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Errors we threw on purpose.
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Request body failed Zod validation: send back which fields were wrong.
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid request", details: err.flatten() },
    });
    return;
  }
  // P2002 is Prisma's "unique constraint failed", e.g. a duplicate email.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({
      error: { code: "already_exists", message: "That record already exists", details: err.meta },
    });
    return;
  }
  // express.json() couldn't parse the body.
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "bad_json", message: "Request body is not valid JSON" } });
    return;
  }
  // Anything else is a bug: log it, but don't leak internals to the client.
  console.error(err);
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
};
