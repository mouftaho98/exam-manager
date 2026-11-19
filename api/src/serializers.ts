import type { CourseMember } from "@prisma/client";
import { config } from "./config.js";

export const inviteUrl = (token: string) => `${config.webUrl}/invite/${token}`;

export function memberName(m: Pick<CourseMember, "firstName" | "lastName" | "email">): string {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
  return name || m.email;
}

/** Member as seen by course staff. Invite links are only shown to instructors. */
export function memberDto(m: CourseMember, opts: { includeInvite?: boolean } = {}) {
  return {
    id: m.id,
    email: m.email,
    role: m.role,
    status: m.status,
    name: memberName(m),
    firstName: m.firstName,
    lastName: m.lastName,
    studentNumber: m.studentNumber,
    needsAccessible: m.needsAccessible,
    leftHanded: m.leftHanded,
    joinedAt: m.joinedAt,
    ...(opts.includeInvite && m.inviteToken ? { inviteUrl: inviteUrl(m.inviteToken) } : {}),
  };
}
