import { randomBytes } from "node:crypto";

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
