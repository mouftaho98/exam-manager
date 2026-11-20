/**
 * Permission checks. Roles are per course, so every check asks
 * "what is this user's role in *this* course?"
 */
import type { CourseMember, CourseRole } from "@prisma/client";
import { prisma } from "./db.js";
import { forbidden, notFound } from "./errors.js";

// Role lists to pass to requireCourseRole.
export const STAFF: CourseRole[] = ["INSTRUCTOR", "PROCTOR"];
export const INSTRUCTOR_ONLY: CourseRole[] = ["INSTRUCTOR"];

/**
 * Returns the user's active membership in the course, or throws.
 * Non-members get 404 so course ids can't be probed.
 */
export async function requireCourseRole(
  userId: string,
  courseId: string,
  roles?: CourseRole[],
): Promise<CourseMember> {
  const member = await prisma.courseMember.findFirst({
    where: { courseId, userId, status: "ACTIVE" },
  });
  // Not in the course at all: pretend it doesn't exist.
  if (!member) throw notFound("Course");
  // In the course, but with the wrong role: 403.
  if (roles && !roles.includes(member.role)) throw forbidden();
  return member;
}
