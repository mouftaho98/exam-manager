import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

const server = createServer(createApp());

server.listen(config.port, () => {
  console.log(`RollCall API listening on port ${config.port}`);
});

// Kubernetes sends SIGTERM before stopping a pod: finish in-flight requests, then exit.
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
