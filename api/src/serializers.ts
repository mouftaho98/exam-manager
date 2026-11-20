/**
 * Turn database rows into the JSON the API sends back.
 * Keeping this in one place means every endpoint returns members the same way,
 * and fields like the invite token are only included on purpose.
 */
import type { Course, Offering, OfferingMember, Seat, User } from "@prisma/client";
import { config } from "./config.js";

/** The link a person opens to join an offering, on the web app (WEB_URL). */
export const inviteUrl = (token: string) => `${config.webUrl}/invite/${token}`;

/** Display name: "First Last", or the email if we don't have a name. */
export function personName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return name || u.email;
}

/** A user as they see themselves (GET /me). Never includes the password hash. */
export function userDto(u: User) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    name: personName(u),
    studentNumber: u.studentNumber,
    needsAccessible: u.needsAccessible,
    leftHanded: u.leftHanded,
  };
}

/** "Fall 2026" */
export function termLabel(o: Pick<Offering, "semester" | "year">): string {
  return `${o.semester.charAt(0)}${o.semester.slice(1).toLowerCase()} ${o.year}`;
}

/** An offering with its course, e.g. ECE1779 Cloud Computing, Fall 2026. */
export function offeringDto(o: Offering & { course: Course }) {
  return {
    id: o.id,
    year: o.year,
    semester: o.semester,
    term: termLabel(o),
    course: { id: o.course.id, code: o.course.code, name: o.course.name },
  };
}

/** Member as seen by staff. Person details come from the User. Invite links are only shown to instructors. */
export function memberDto(m: OfferingMember & { user: User }, opts: { includeInvite?: boolean } = {}) {
  return {
    id: m.id,
    userId: m.userId,
    email: m.user.email,
    role: m.role,
    status: m.status,
    name: personName(m.user),
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    studentNumber: m.user.studentNumber,
    needsAccessible: m.user.needsAccessible,
    leftHanded: m.user.leftHanded,
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
