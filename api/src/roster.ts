import { parse } from "csv-parse/sync";
import { z } from "zod";

export interface RosterRow {
  line: number;
  email: string;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
  needsAccessible: boolean;
  leftHanded: boolean;
}

export interface RosterError {
  line: number;
  message: string;
}

// Header names are matched loosely: "Student Number", "student_number" and
// "studentnumber" all work.
const HEADER_ALIASES: Record<string, keyof Omit<RosterRow, "line">> = {
  email: "email",
  emailaddress: "email",
  studentnumber: "studentNumber",
  studentno: "studentNumber",
  studentid: "studentNumber",
  utorid: "studentNumber",
  firstname: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  accessible: "needsAccessible",
  accessibility: "needsAccessible",
  needsaccessible: "needsAccessible",
  wheelchair: "needsAccessible",
  lefthanded: "leftHanded",
  lefty: "leftHanded",
};

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "x"]);
const emailSchema = z.string().email();

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Parses a roster CSV. Expected columns (header row required):
 * email, student_number, first_name, last_name, accessible, left_handed
 * Only email is required. Rows with problems are reported, not thrown.
 */
export function parseRoster(csv: string): { rows: RosterRow[]; errors: RosterError[] } {
  let records: string[][];
  try {
    records = parse(csv.replace(/^﻿/, ""), {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (e) {
    return { rows: [], errors: [{ line: 0, message: `Could not read CSV: ${(e as Error).message}` }] };
  }
  if (records.length === 0) return { rows: [], errors: [{ line: 0, message: "CSV is empty" }] };

  const fields = records[0].map((h) => HEADER_ALIASES[normalizeHeader(h)]);
  if (!fields.includes("email")) {
    return { rows: [], errors: [{ line: 1, message: "CSV needs an 'email' column in the header row" }] };
  }

  const rows: RosterRow[] = [];
  const errors: RosterError[] = [];
  const seenEmails = new Set<string>();
  const seenNumbers = new Set<string>();

  records.slice(1).forEach((record, i) => {
    const line = i + 2;
    const row: RosterRow = { line, email: "", needsAccessible: false, leftHanded: false };
    record.forEach((value, col) => {
      const field = fields[col];
      if (!field || value === "") return;
      if (field === "needsAccessible" || field === "leftHanded") {
        row[field] = TRUE_VALUES.has(value.toLowerCase());
      } else {
        row[field] = value;
      }
    });
    row.email = row.email.toLowerCase();

    if (!emailSchema.safeParse(row.email).success) {
      errors.push({ line, message: `Invalid or missing email "${row.email}"` });
      return;
    }
    if (seenEmails.has(row.email)) {
      errors.push({ line, message: `Duplicate email ${row.email}` });
      return;
    }
    if (row.studentNumber && seenNumbers.has(row.studentNumber)) {
      errors.push({ line, message: `Duplicate student number ${row.studentNumber}` });
      return;
    }
    seenEmails.add(row.email);
    if (row.studentNumber) seenNumbers.add(row.studentNumber);
    rows.push(row);
  });

  return { rows, errors };
}
