import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

const app = createApp();
const server = createServer(app);

const io = new Server(server, {
  cors: { origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",") },
});

if (config.redisUrl) {
  const pubClient = new Redis(config.redisUrl);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));
}

app.set("io", io);

io.on("connection", (socket) => {
  socket.on("joinExam", (examId: string) => {
    socket.join(`exam:${examId}`);
  });
});

server.listen(config.port, () => {
  console.log(`RollCall API listening on port ${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
