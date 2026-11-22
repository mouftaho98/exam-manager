/**
 * Entry point: starts the HTTP server and shuts it down cleanly.
 * This is what `npm start` and the Docker container run (dist/index.js).
 */
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { attachRealtime, closeRealtime } from "./realtime.js";

// A plain Node HTTP server wrapping the Express app.
const server = createServer(createApp());
// Add Socket.IO (live updates) to the same server and port.
await attachRealtime(server);

server.listen(config.port, () => {
  console.log(`RollCall API listening on port ${config.port}`);
});

// Kubernetes sends SIGTERM before stopping a pod: finish in-flight requests, then exit.
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  // Disconnect live-update sockets and close the HTTP server (Socket.IO closes
  // it too), waiting for open requests to finish.
  await closeRealtime();
  // Close the database connection pool.
  await prisma.$disconnect();
  process.exit(0);
}
// SIGTERM comes from Kubernetes / Docker; SIGINT is Ctrl+C in a terminal.
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
