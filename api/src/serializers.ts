/**
 * Turn database rows into the JSON the API sends back.
 * Keeping this in one place means every endpoint returns members the same way,
 * and fields like the invite token are only included on purpose.
 */
import type { CourseMember, Seat } from "@prisma/client";
import { config } from "./config.js";

/** The link a person opens to join a course, on the web app (WEB_URL). */
export const inviteUrl = (token: string) => `${config.webUrl}/invite/${token}`;

/** Display name: "First Last", or the email if we don't have a name. */
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

/** One seat as the API returns it. */
export function seatDto(s: Seat) {
  return {
    id: s.id,
    row: s.row,
    col: s.col,
    label: s.label,
    accessible: s.accessible,
    leftHanded: s.leftHanded,
    broken: s.broken,
  };
}

/** Groups seats into rows (front first) for drawing the room map. */
export function seatRows<T extends Seat>(seats: T[]) {
  const rows = new Map<number, T[]>();
  for (const s of [...seats].sort((a, b) => a.row - b.row || a.col - b.col)) {
    if (!rows.has(s.row)) rows.set(s.row, []);
    rows.get(s.row)!.push(s);
  }
  return [...rows.entries()].map(([row, rowSeats]) => ({ row, seats: rowSeats }));
}
