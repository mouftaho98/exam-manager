/**
 * The one shared database client for the whole app.
 *
 * PrismaClient keeps a pool of connections to Postgres, so we create it once
 * and import it everywhere instead of making a new one per request.
 * It connects using the DATABASE_URL environment variable.
 */
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
