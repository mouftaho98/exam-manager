/**
 * Unit tests for the seat assignment algorithm. No database needed.
 */
import { describe, expect, it } from "vitest";
import { assignSeats, seededRandom, type SeatInput, type StudentInput } from "../src/seating.js";

/** Builds a room from row lengths, e.g. [4, 6, 6] -> rows of 4, 6 and 6 seats. */
function room(roomId: string, rowLengths: number[], tag: (row: number, col: number) => Partial<SeatInput> = () => ({})) {
  const seats: SeatInput[] = [];
  rowLengths.forEach((len, row) => {
    for (let col = 0; col < len; col++) {
      seats.push({ id: `${roomId}-${row}-${col}`, roomId, row, col, accessible: false, leftHanded: false, broken: false, ...tag(row, col) });
    }
  });
  return seats;
}

/** n students with ids s0, s1, ...; `extra` sets flags for some of them. */
function students(n: number, extra: (i: number) => Partial<StudentInput> = () => ({})): StudentInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, needsAccessible: false, leftHanded: false, ...extra(i) }));
}

/** Count pairs of students sitting next to each other (side by side or front/back). */
function adjacentPairs(seats: SeatInput[], assignments: Map<string, string>) {
  const byId = new Map(seats.map((s) => [s.id, s]));
  const taken = new Set([...assignments.values()].map((id) => {
    const s = byId.get(id)!;
    return `${s.roomId}:${s.row}:${s.col}`;
  }));
  let pairs = 0;
  for (const id of assignments.values()) {
    const s = byId.get(id)!;
    if (taken.has(`${s.roomId}:${s.row}:${s.col + 1}`)) pairs++;
    if (taken.has(`${s.roomId}:${s.row + 1}:${s.col}`)) pairs++;
  }
  return pairs;
}

describe("assignSeats", () => {
  it("seats everyone with no neighbours when the room is at most half full", () => {
    const seats = room("r", [10, 10, 10, 10]); // 40 seats
    const result = assignSeats(seats, students(20), seededRandom(1));
    expect(result.assignments.size).toBe(20);
    expect(result.unassigned).toEqual([]);
    expect(adjacentPairs(seats, result.assignments)).toBe(0);
  });

  it("handles rooms that are not rectangles", () => {
    const seats = room("r", [4, 7, 9, 9, 5]); // 34 seats, ragged rows
    const result = assignSeats(seats, students(15), seededRandom(2));
    expect(result.assignments.size).toBe(15);
    expect(adjacentPairs(seats, result.assignments)).toBe(0);
  });

  it("fills every seat when there are exactly as many students as seats", () => {
    const seats = room("r", [5, 5]);
    const result = assignSeats(seats, students(10), seededRandom(3));
    expect(result.assignments.size).toBe(10);
    expect(new Set(result.assignments.values()).size).toBe(10); // no seat used twice
  });

  it("never uses broken seats and reports students who don't fit", () => {
    const seats = room("r", [5, 5], (row) => ({ broken: row === 1 })); // 5 usable
    const result = assignSeats(seats, students(7), seededRandom(4));
    expect(result.assignments.size).toBe(5);
    expect(result.unassigned).toHaveLength(2);
    for (const seatId of result.assignments.values()) expect(seatId.startsWith("r-0-")).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/2 student/);
  });

  it("puts students who need accessible seats on accessible seats", () => {
    const seats = room("r", [8, 8, 8], (row, col) => ({ accessible: row === 2 && col < 2 }));
    const list = students(12, (i) => ({ needsAccessible: i < 2 }));
    const result = assignSeats(seats, list, seededRandom(5));
    expect(result.assignments.get("s0")).toMatch(/^r-2-[01]$/);
    expect(result.assignments.get("s1")).toMatch(/^r-2-[01]$/);
  });

  it("puts left-handed students on left-handed seats and keeps those seats for them", () => {
    const seats = room("r", [6, 6], (_row, col) => ({ leftHanded: col === 0 })); // 2 lefty seats
    const list = students(12, (i) => ({ leftHanded: i === 0 }));
    const result = assignSeats(seats, list, seededRandom(6));
    expect(result.assignments.get("s0")).toMatch(/^r-[01]-0$/);
    expect(result.assignments.size).toBe(12);
  });

  it("warns and still seats students when special seats run out", () => {
    const seats = room("r", [6], (_row, col) => ({ accessible: col === 0 }));
    const list = students(3, (i) => ({ needsAccessible: i < 2 }));
    const result = assignSeats(seats, list, seededRandom(7));
    expect(result.assignments.size).toBe(3);
    expect(result.warnings.join(" ")).toMatch(/accessible/);
  });

  it("spreads students over several rooms", () => {
    const seats = [...room("a", [6, 6]), ...room("b", [6, 6])];
    const result = assignSeats(seats, students(12), seededRandom(8));
    expect(result.assignments.size).toBe(12);
    expect(adjacentPairs(seats, result.assignments)).toBe(0);
  });

  it("gives the same seating for the same seed", () => {
    const seats = room("r", [10, 10, 10]);
    const a = assignSeats(seats, students(14), seededRandom(42));
    const b = assignSeats(seats, students(14), seededRandom(42));
    expect([...a.assignments]).toEqual([...b.assignments]);
  });

  it("seats 600 students across 3 large rooms quickly", () => {
    const seats = [...room("a", Array(20).fill(20)), ...room("b", Array(20).fill(20)), ...room("c", Array(20).fill(20))];
    const start = Date.now();
    const result = assignSeats(seats, students(600), seededRandom(9));
    expect(result.assignments.size).toBe(600);
    expect(adjacentPairs(seats, result.assignments)).toBe(0); // 1200 seats, so half full fits a checkerboard
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
