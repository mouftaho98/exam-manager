import type { CourseMember, CourseRole } from "@prisma/client";
import { prisma } from "./db.js";
import { forbidden, notFound } from "./errors.js";

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
  if (!member) throw notFound("Course");
  if (roles && !roles.includes(member.role)) throw forbidden();
  return member;
}

/** Loads an exam and checks the user's role in its course. */
export async function requireExamRole(userId: string, examId: string, roles?: CourseRole[]) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw notFound("Exam");
  const member = await requireCourseRole(userId, exam.courseId, roles);
  return { exam, member };
}
