/**
 * Shared helpers for the integration tests.
 */
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

/** One app instance shared by all tests in a file. */
export const app = createApp();
/** Start a request against the app, e.g. `api().get("/health")`. No real port is opened. */
export const api = () => request(app);

/** Empty every table, so each test file starts from a clean database. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "CourseMember", "Course", "User" CASCADE`,
  );
}

/** Create an account through the API and return its login token. */
export async function register(email: string, name = email.split("@")[0]) {
  const res = await api().post("/auth/register").send({ email, password: "password123", name });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user as { id: string; email: string } };
}

/** Headers that sign a request in as the owner of `token`. */
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Pull the token out of an invite link (".../invite/<token>"). */
export const tokenFromInviteUrl = (url: string) => url.split("/invite/")[1];
