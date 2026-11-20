/**
 * Live updates for exam day, over Socket.IO. See the notes below for the protocol.
 */
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

// The Socket.IO server. Undefined until attachRealtime runs (e.g. in most tests),
// in which case publish() does nothing.
let io: Server | undefined;

export type ExamEvent = "checkin:created" | "checkin:removed" | "seat:moved" | "seating:generated";

/** Name of the Socket.IO room for one exam. */
export const examChannel = (examId: string) => `exam:${examId}`;

/**
 * Send an event to everyone watching an exam. Called by the routes after a
 * change is saved. With Redis, this reaches watchers on every API pod.
 */
export function publish(examId: string, event: ExamEvent, payload: Record<string, unknown>) {
  io?.to(examChannel(examId)).emit(event, { examId, ...payload });
}

// What clients send with "exam:join" / "exam:leave".
const joinBody = z.object({ examId: z.string().min(1) });

/** Start Socket.IO on the given HTTP server (same port as the API). */
export async function attachRealtime(server: HttpServer): Promise<Server> {
  io = new Server(server, {
    cors: { origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") },
  });

  // Redis adapter: one connection publishes events, one subscribes to events from other pods.
  if (config.redisUrl) {
    const pub = createClient({ url: config.redisUrl });
    const sub = pub.duplicate();
    pub.on("error", (e) => console.error("Redis error", e));
    sub.on("error", (e) => console.error("Redis error", e));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    console.log("Socket.IO using Redis adapter");
  }

  // Every connection must send a valid login token, checked once when it connects.
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
    // Join an exam's channel. Replies through the ack callback with { ok } so the client knows if it worked.
    socket.on("exam:join", async (raw, ack?: (res: unknown) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const { examId } = joinBody.parse(raw);
        // Only active staff of the exam's course may listen.
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

    // Stop getting events for an exam (e.g. the proctor switched exams).
    socket.on("exam:leave", async (raw) => {
      const parsed = joinBody.safeParse(raw);
      if (parsed.success) await socket.leave(examChannel(parsed.data.examId));
    });
  });

  return io;
}

/** Close all sockets and the HTTP server. Used on shutdown and in tests. */
export async function closeRealtime() {
  await io?.close();
  io = undefined;
}
