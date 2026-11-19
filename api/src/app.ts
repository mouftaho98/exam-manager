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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

  // Liveness: the process is up. Readiness: it can reach the database.
  // Use these for the Kubernetes probes.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use("/auth", authRouter);
  app.use("/invites", invitesRouter); // GET is public; accept requires auth
  app.use("/me", requireAuth, meRouter);
  app.use("/courses", requireAuth, coursesRouter);

  app.use((_req, _res, next) => next(notFound("Route")));
  app.use(errorHandler);
  return app;
}
