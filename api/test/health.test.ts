/**
 * Tests for the health endpoints and the app-wide error handling
 * (404s for unknown routes, 400 for broken JSON).
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api } from "./helpers.js";

describe("health checks", () => {
  // Close the DB pool so Vitest can exit.
  afterAll(() => prisma.$disconnect());

  it("GET /health says the process is up", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /ready checks the database", async () => {
    const res = await api().get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("unknown routes get a 404 in the standard error shape", async () => {
    const res = await api().get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Route not found" } });
  });

  it("unknown routes 404 even without a token", async () => {
    expect((await api().get("/exams-typo")).status).toBe(404);
    expect((await api().get("/exams/abc")).status).toBe(401); // real routes still need a token
  });

  it("malformed JSON gets a 400", async () => {
    const res = await api().post("/health").set("Content-Type", "application/json").send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_json");
  });
});
