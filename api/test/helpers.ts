import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "CourseMember", "Course", "User" CASCADE`,
  );
}

export async function register(email: string, name = email.split("@")[0]) {
  const res = await api().post("/auth/register").send({ email, password: "password123", name });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token as string, user: res.body.user as { id: string; email: string } };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const tokenFromInviteUrl = (url: string) => url.split("/invite/")[1];
