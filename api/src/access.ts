/**
 * Permission checks. Roles are per offering, so every check asks
 * "what is this user's role in *this* offering?"
 */
import type { OfferingMember, Role } from "@prisma/client";
import { prisma } from "./db.js";
import { HttpError, forbidden, notFound } from "./errors.js";

// Role lists to pass to requireOfferingRole.
export const STAFF: Role[] = ["INSTRUCTOR", "PROCTOR"];
export const INSTRUCTOR_ONLY: Role[] = ["INSTRUCTOR"];

/**
 * Only approved instructors may create courses and offerings.
 * 403 `instructor_not_approved` otherwise (including while a request is pending).
 */
export async function requireApprovedInstructor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { instructorStatus: true } });
  if (user?.instructorStatus !== "APPROVED") {
    throw new HttpError(
      403,
      "instructor_not_approved",
      user?.instructorStatus === "PENDING"
        ? "Your instructor request is waiting for an admin to approve it"
        : "Only approved instructors can do this. Request instructor access first.",
    );
  }
}

/** Only admins (User.isAdmin) may approve instructors. */
export async function requireAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) throw forbidden("Admins only");
}

/**
 * Returns the user's active membership in the offering, or throws.
 * Non-members get 404 so offering ids can't be probed.
 */
export async function requireOfferingRole(
  userId: string,
  offeringId: string,
  roles?: Role[],
): Promise<OfferingMember> {
  const member = await prisma.offeringMember.findFirst({
    where: { offeringId, userId, status: "ACTIVE" },
  });
  // Not in the offering at all: pretend it doesn't exist.
  if (!member) throw notFound("Offering");
  // In the offering, but with the wrong role: 403.
  if (roles && !roles.includes(member.role)) throw forbidden();
  return member;
}
