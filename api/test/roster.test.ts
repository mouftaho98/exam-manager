/**
 * Unit tests for the roster CSV parser. No database needed.
 */
import { describe, expect, it } from "vitest";
import { parseRoster } from "../src/roster.js";

describe("parseRoster", () => {
  it("reads the standard columns and ignores others (like accessibility)", () => {
    const { rows, errors } = parseRoster(
      "email,student_number,first_name,last_name,accessible\n" +
        "Ana@Mail.com,1001,Ana,Lee,yes\n" +
        "bo@mail.com,1002,Bo,Chan,\n",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, email: "ana@mail.com", studentNumber: "1001", firstName: "Ana", lastName: "Lee" },
      { line: 3, email: "bo@mail.com", studentNumber: "1002", firstName: "Bo", lastName: "Chan" },
    ]);
  });

  it("accepts loose header names and quoted values", () => {
    const { rows } = parseRoster('"Student Number","Email Address","Last Name"\n"2001","c@mail.com","O\'Neil, Jr"\n');
    expect(rows[0]).toMatchObject({ email: "c@mail.com", studentNumber: "2001", lastName: "O'Neil, Jr" });
  });

  it("reports bad rows without dropping good ones", () => {
    const { rows, errors } = parseRoster("email,student_number\nnot-an-email,1\nok@mail.com,2\nok@mail.com,3\nz@mail.com,2\n");
    expect(rows.map((r) => r.email)).toEqual(["ok@mail.com"]);
    expect(errors.map((e) => e.line)).toEqual([2, 4, 5]);
  });

  it("requires an email column", () => {
    const { rows, errors } = parseRoster("name,number\nAna,1\n");
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/email/);
  });
});
