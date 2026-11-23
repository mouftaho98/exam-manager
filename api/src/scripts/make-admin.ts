/**
 * Make an existing user an admin (and an approved instructor).
 *
 * There's no admin yet to approve the first one, so this is done from the
 * command line instead of the API:
 *
 *   npm run make-admin -- you@uni.ca                       (locally)
 *   node dist/scripts/make-admin.js you@uni.ca             (inside the container)
 *
 * The person must have registered first.
 */
import { prisma } from "../db.js";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: make-admin <email>");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user?.passwordHash) {
  console.error(`No registered user with email ${email}. Sign up first.`);
  process.exit(1);
}
await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true, instructorStatus: "APPROVED" } });
console.log(`${email} is now an admin and an approved instructor`);
await prisma.$disconnect();
