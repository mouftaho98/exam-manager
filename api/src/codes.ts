/**
 * Random codes and tokens.
 */
import { randomBytes } from "node:crypto";

/** A long random token for invite links. 24 random bytes, so it can't be guessed. */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
