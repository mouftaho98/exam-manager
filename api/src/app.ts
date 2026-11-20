/**
 * Builds the Express app: middleware, routes and error handling.
 *
 * This file only creates the app. It doesn't start a server, so tests can
 * call createApp() and send requests to it without opening a port.
 * The real server is started in index.ts.
 */
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { requireAuth } from "./auth.js";
import { errorHandler, notFound } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { invitesRouter } from "./routes/invites.js";
import { coursesRouter } from "./routes/courses.js";
import { roomsRouter } from "./routes/rooms.js";
import { examsRouter } from "./routes/exams.js";

/** Create a new, fully configured Express app. */
export function createApp() {
  const app = express();

  // Don't advertise "X-Powered-By: Express" in every response.
  app.disable("x-powered-by");

  // Let the frontend (served from another origin) call the API from the browser.
  // CORS_ORIGIN="*" allows any origin; otherwise it's a comma-separated list.
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));

  // Parse request bodies: JSON for normal requests, plain text for CSV roster uploads.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

  // Liveness: the process is up. Readiness: it can reach the database.
  // Use these for the Kubernetes probes.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/ready", async (_req, res) => {
    try {
      // Cheapest possible query: proves the DB connection works.
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      // 503 tells Kubernetes to stop sending traffic to this pod until the DB is back.
      res.status(503).json({ ok: false });
    }
  });

  // API routes. Each router lives in src/routes/. requireAuth rejects requests
  // without a valid login token before they reach the router.
  app.use("/auth", authRouter); // register and log in (public)
  app.use("/invites", invitesRouter); // GET is public; accept requires auth
  app.use("/me", requireAuth, meRouter); // the signed-in user's own data
  app.use("/courses", requireAuth, coursesRouter); // courses and their members
  app.use("/rooms", requireAuth, roomsRouter); // room layouts (shared by all courses)
  // Exams live under both /courses/:id/exams and /exams/:id, so this router is
  // mounted at "/". It signs in on its own paths, so unknown routes still 404.
  app.use("/", examsRouter);

  // Anything that didn't match a route above is a 404.
  app.use((_req, _res, next) => next(notFound("Route")));
  // Must be registered last: turns any thrown error into a JSON error response.
  app.use(errorHandler);
  return app;
}
