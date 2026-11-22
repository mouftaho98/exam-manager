/**
 * Creating and updating people (User records) on behalf of an instructor,
 * e.g. from a roster upload or "add member".
 *
 * An instructor can add someone who has no account yet, so this creates a
 * User with no password. The rules for an existing User are stricter,
 * because that record is shared across every offering the person is in:
 *
 * - accessibility / left-handed needs: never set here. Students set those
 *   themselves, at sign-up or with PATCH /me.
 * - student number: updated, unless another person already has it
 * - name: only updated while the person hasn't registered yet. After that,
 *   the name they chose is theirs.
 */
import type { Prisma, User } from "@prisma/client";

/** What an instructor may say about a person. Only email is required. */
export interface PersonInput {
  email: string; // already lowercase
  firstName?: string;
  lastName?: string;
  studentNumber?: string;
}

/**
 * Find the User with this email, creating them if needed, and apply the
 * fields above. Returns `{ error }` instead of throwing, so a roster upload
 * can report the problem for one row and carry on.
 */
export async function upsertPerson(
  tx: Prisma.TransactionClient,
  input: PersonInput,
): Promise<{ user: User; created: boolean } | { error: string }> {
  const existing = await tx.user.findUnique({ where: { email: input.email } });

  // The student number must not already belong to someone else.
  if (input.studentNumber) {
    const owner = await tx.user.findUnique({ where: { studentNumber: input.studentNumber } });
    if (owner && owner.email !== input.email) {
      return { error: `Student number ${input.studentNumber} already belongs to ${owner.email}` };
    }
  }

  if (!existing) {
    const user = await tx.user.create({ data: input });
    return { user, created: true };
  }

  // Only include fields that were actually given, so blanks don't wipe data.
  const data: Prisma.UserUpdateInput = {};
  if (input.studentNumber !== undefined) data.studentNumber = input.studentNumber;
  if (existing.passwordHash === null) {
    // Not registered yet, so the instructor's spelling of the name is all we have.
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
  }
  const user = Object.keys(data).length ? await tx.user.update({ where: { id: existing.id }, data }) : existing;
  return { user, created: false };
}
