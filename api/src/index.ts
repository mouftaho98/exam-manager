/**
 * Entry point: starts the HTTP server and shuts it down cleanly.
 * This is what `npm start` and the Docker container run (dist/index.js).
 */
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

// A plain Node HTTP server wrapping the Express app.
const server = createServer(createApp());

server.listen(config.port, () => {
  console.log(`RollCall API listening on port ${config.port}`);
});

// Kubernetes sends SIGTERM before stopping a pod: finish in-flight requests, then exit.
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  // Stop accepting new connections and wait for open requests to finish.
  await new Promise((resolve) => server.close(resolve));
  // Close the database connection pool.
  await prisma.$disconnect();
  process.exit(0);
}
// SIGTERM comes from Kubernetes / Docker; SIGINT is Ctrl+C in a terminal.
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
