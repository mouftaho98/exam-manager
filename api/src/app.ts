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
import { errorHandler, notFound } from "./errors.js";
import authRoutes from "./routes/auth.js";

/** Create a new, fully configured Express app. */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "5mb" }));

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

  app.use("/auth", authRoutes);

  app.use((_req, _res, next) => next(notFound("Route")));
  app.use(errorHandler);
  return app;
}
