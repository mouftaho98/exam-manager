import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { prisma } from "../src/db.js";
import { attachRealtime, closeRealtime } from "../src/realtime.js";
import { app, auth, register, resetDb, tokenFromInviteUrl } from "./helpers.js";

describe("live updates over Socket.IO", () => {
  let server: Server;
  let url: string;
  let proctorToken: string;
  let studentToken: string;
  let examId: string;
  let code: string;
  let roomId: string;
  const sockets: Socket[] = [];

  const open = (token: string) => {
    const s = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
    sockets.push(s);
    return s;
  };
  const join = (s: Socket, id: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => s.emit("exam:join", { examId: id }, resolve));

  beforeAll(async () => {
    await resetDb();
    server = createServer(app);
    await attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
    const http = () => request(server);

    const prof = await register("prof@uni.ca");
    const course = await http().post("/courses").set(auth(prof.token)).send({ code: "C1", name: "Course" });
    const courseId = course.body.course.id;
    const roster = await http()
      .post(`/courses/${courseId}/roster`)
      .set(auth(prof.token))
      .set("Content-Type", "text/csv")
      .send("email\nstu@mail.com\n");
    const ta = await http().post(`/courses/${courseId}/members`).set(auth(prof.token)).send({ email: "ta@uni.ca", role: "PROCTOR" });

    const proctor = await register("ta@uni.ca");
    proctorToken = proctor.token;
    await http().post(`/invites/${tokenFromInviteUrl(ta.body.member.inviteUrl)}/accept`).set(auth(proctorToken));
    const student = await register("stu@mail.com");
    studentToken = student.token;
    await http().post(`/invites/${tokenFromInviteUrl(roster.body.invites[0].inviteUrl)}/accept`).set(auth(studentToken));

    const room = await http().post("/rooms").set(auth(prof.token)).send({ name: "R1", rows: [{ seats: 4 }] });
    roomId = room.body.room.id;
    const exam = await http()
      .post(`/courses/${courseId}/exams`)
      .set(auth(prof.token))
      .send({ title: "Final", startsAt: "2026-12-10T09:00:00Z", durationMinutes: 60, roomIds: [roomId] });
    examId = exam.body.exam.id;
    await http().post(`/exams/${examId}/seating/generate`).set(auth(prof.token)).send({});
    code = (await prisma.seatAssignment.findFirstOrThrow({ where: { examId } })).checkinCode;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await closeRealtime(); // also closes the HTTP server
    await prisma.$disconnect();
  });

  it("rejects connections without a valid token", async () => {
    const s = open("not-a-token");
    const err = await new Promise<Error>((resolve) => s.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
  });

  it("only lets course staff join an exam channel", async () => {
    expect(await join(open(studentToken), examId)).toEqual({ ok: false, error: "forbidden" });
    expect(await join(open(proctorToken), examId)).toEqual({ ok: true });
  });

  it("pushes a check-in to proctors watching the exam", async () => {
    const watcher = open(proctorToken);
    expect(await join(watcher, examId)).toEqual({ ok: true });
    const event = new Promise<Record<string, unknown>>((resolve) => watcher.on("checkin:created", resolve));

    const res = await request(server).post(`/exams/${examId}/checkins`).set(auth(proctorToken)).send({ code, roomId });
    expect(res.status).toBe(201);
    expect(await event).toMatchObject({ examId, roomId, seatLabel: res.body.seat.label });
  });
});
