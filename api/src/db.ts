/**
 * The shared database client. Import `prisma` from here instead of creating
 * new clients, so the whole app uses one connection pool.
 */
import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/**
 * Run `fn` in a Serializable transaction, retrying when Postgres aborts it
 * because another transaction touched the same rows at the same time
 * (Prisma error P2034). Without the retry, two proctors moving seats at once,
 * or two exams generating seating together, could get a 500 instead of
 * simply running one after the other.
 */
export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { timeout?: number; attempts?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable", timeout: opts.timeout });
    } catch (e) {
      const conflict = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
      if (!conflict || attempt >= attempts) throw e;
      // Back off a little (with jitter) so the retries don't collide again.
      await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
    }
  }
}
