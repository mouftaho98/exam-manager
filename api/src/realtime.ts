import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { z } from "zod";
import { config } from "./config.js";
import { verifyToken } from "./auth.js";
import { prisma } from "./db.js";
import { STAFF } from "./access.js";

// Live updates for exam day.
//
// Clients connect with { auth: { token } } and emit "exam:join" with
// { examId } to receive events for that exam. Only course staff can join.
// Each exam has its own Socket.IO room, "exam:<id>".
//
// With REDIS_URL set, the Redis adapter relays events between API pods, so a
// check-in handled by one pod reaches proctors connected to any other pod.
// Clients should use transports: ["websocket"] so they don't need sticky
// sessions behind the load balancer.
//
// Events sent to an exam room:
//   checkin:created  { examId, memberId, roomId, seatId, ... }
//   checkin:removed  { examId, memberId, roomId }
//   seat:moved       { examId, moves: [{ memberId, seatId, roomId }] }
//   seating:generated { examId, assigned, unassigned }

let io: Server | undefined;

export type ExamEvent = "checkin:created" | "checkin:removed" | "seat:moved" | "seating:generated";

export const examChannel = (examId: string) => `exam:${examId}`;

export function publish(examId: string, event: ExamEvent, payload: Record<string, unknown>) {
  io?.to(examChannel(examId)).emit(event, { examId, ...payload });
}

const joinBody = z.object({ examId: z.string().min(1) });

export async function attachRealtime(server: HttpServer): Promise<Server> {
  io = new Server(server, {
    cors: { origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") },
  });

  if (config.redisUrl) {
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    pub.on("error", (e) => console.error("Redis error", e));
    sub.on("error", (e) => console.error("Redis error", e));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log("Socket.IO using Redis adapter");
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string") throw new Error("missing token");
      socket.data.user = verifyToken(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("exam:join", async (raw, ack?: (res: unknown) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const { examId } = joinBody.parse(raw);
        const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { courseId: true } });
        const member = exam
          ? await prisma.courseMember.findFirst({
              where: { courseId: exam.courseId, userId: socket.data.user.id, status: "ACTIVE", role: { in: STAFF } },
            })
          : null;
        if (!member) return reply({ ok: false, error: "forbidden" });
        await socket.join(examChannel(examId));
        reply({ ok: true });
      } catch {
        reply({ ok: false, error: "bad_request" });
      }
    });

    socket.on("exam:leave", async (raw) => {
      const parsed = joinBody.safeParse(raw);
      if (parsed.success) await socket.leave(examChannel(parsed.data.examId));
    });
  });

  return io;
}

export async function closeRealtime() {
  await io?.close();
  io = undefined;
}
