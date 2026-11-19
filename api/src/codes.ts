import { randomBytes, randomInt } from "node:crypto";

// No 0/O, 1/I/L: these codes get read aloud and typed in by proctors.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newCheckinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Codes are case-insensitive and ignore spaces/dashes when typed in. */
export function normalizeCheckinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** Generates `count` codes that don't collide with each other or with `taken`. */
export function uniqueCheckinCodes(count: number, taken: Iterable<string> = []): string[] {
  const used = new Set(taken);
  const codes: string[] = [];
  while (codes.length < count) {
    const code = newCheckinCode();
    if (used.has(code)) continue;
    used.add(code);
    codes.push(code);
  }
  return codes;
}
