/**
 * Permission checks. Roles are per offering, so every check asks
 * "what is this user's role in *this* offering?"
 */
import type { OfferingMember, Role } from "@prisma/client";
import { prisma } from "./db.js";
import { forbidden, notFound } from "./errors.js";

// Role lists to pass to requireOfferingRole.
export const STAFF: Role[] = ["INSTRUCTOR", "PROCTOR"];
export const INSTRUCTOR_ONLY: Role[] = ["INSTRUCTOR"];

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
