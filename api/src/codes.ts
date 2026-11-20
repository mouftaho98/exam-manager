/**
 * Random codes and tokens: invite links, and the short check-in codes
 * students show (as a QR code) on exam day.
 */
import { randomBytes, randomInt } from "node:crypto";

// No 0/O, 1/I/L: these codes get read aloud and typed in by proctors.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
// 31^6 is about 887 million possible codes, plenty for one exam.
const CODE_LENGTH = 6;

/** A long random token for invite links. 24 random bytes, so it can't be guessed. */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/** One random check-in code, e.g. "K7Q2MX". Uses crypto randomness so codes can't be predicted. */
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
    if (used.has(code)) continue; // rare collision: just draw again
    used.add(code);
    codes.push(code);
  }
  return codes;
}
