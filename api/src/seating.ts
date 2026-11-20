// Seat assignment algorithm. Pure function, no database, so it is easy to test.
//
// Rules, in priority order:
// 1. Broken seats are never used.
// 2. Students who need an accessible seat are placed first, on accessible seats.
// 3. Left-handed students are placed next, on left-handed seats.
// 4. Everyone else is placed randomly, avoiding the special seats while
//    ordinary seats are left, so they stay free for students who need them.
// 5. Spacing: every pick prefers the seat with the fewest occupied neighbours
//    (same row col +/- 1, same col row +/- 1). Ties prefer a checkerboard
//    pattern, so up to about half the seats can be filled with no two
//    students side by side. Only once that runs out do students sit together.

/** A seat, with just the fields the algorithm needs. */
export interface SeatInput {
  id: string;
  roomId: string;
  row: number;
  col: number;
  accessible: boolean;
  leftHanded: boolean;
  broken: boolean;
}

/** A student, with just the fields the algorithm needs. */
export interface StudentInput {
  id: string;
  needsAccessible: boolean;
  leftHanded: boolean;
}

/** What assignSeats returns. */
export interface SeatingResult {
  /** studentId -> seatId */
  assignments: Map<string, string>;
  /** Students who didn't fit (more students than usable seats). */
  unassigned: string[];
  /** Human-readable problems to show the instructor, e.g. not enough accessible seats. */
  warnings: string[];
}

/** Small seeded random generator (mulberry32) so a seating can be reproduced. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle. Returns a new array; uses `random` so results are repeatable. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A string key for a seat position, so we can look up "is this spot taken?" in a Set. */
const key = (roomId: string, row: number, col: number) => `${roomId}:${row}:${col}`;

/**
 * Decide which student sits where. Doesn't touch the database: the caller
 * saves the result. Pass seededRandom(n) as `random` to get the same seating
 * every time for the same input.
 */
export function assignSeats(
  seats: SeatInput[],
  students: StudentInput[],
  random: () => number = Math.random,
): SeatingResult {
  const usable = seats.filter((s) => !s.broken);
  // Seat ids still available.
  const free = new Set(usable.map((s) => s.id));
  // Positions already taken, as key(room,row,col), for the neighbour checks.
  const occupied = new Set<string>(); // position keys
  const assignments = new Map<string, string>();
  const unassigned: string[] = [];
  const warnings: string[] = [];

  // For each room, use the checkerboard colour that has more usable seats.
  const parityByRoom = new Map<string, number>();
  for (const roomId of new Set(usable.map((s) => s.roomId))) {
    const inRoom = usable.filter((s) => s.roomId === roomId);
    const even = inRoom.filter((s) => (s.row + s.col) % 2 === 0).length;
    parityByRoom.set(roomId, even >= inRoom.length - even ? 0 : 1);
  }
  // 0 if the seat is on this room's checkerboard colour, 1 if not.
  const offPattern = (s: SeatInput) => ((s.row + s.col) % 2 === parityByRoom.get(s.roomId) ? 0 : 1);
  // How many of the 4 seats around this one (left, right, front, behind) are taken.
  const occupiedNeighbours = (s: SeatInput) =>
    [
      [s.row, s.col - 1],
      [s.row, s.col + 1],
      [s.row - 1, s.col],
      [s.row + 1, s.col],
    ].filter(([r, c]) => occupied.has(key(s.roomId, r, c))).length;
  const isSpecial = (s: SeatInput) => s.accessible || s.leftHanded;

  // Picks the best free seat from `candidates` by comparing score arrays
  // (lower is better); random order breaks ties.
  function pick(candidates: SeatInput[], score: (s: SeatInput) => number[]): SeatInput | undefined {
    let best: SeatInput | undefined;
    let bestScore: number[] = [];
    for (const s of shuffle(candidates.filter((c) => free.has(c.id)), random)) {
      const sc = score(s);
      if (!best || compare(sc, bestScore) < 0) {
        best = s;
        bestScore = sc;
      }
    }
    return best;
  }

  /** Give `seat` to the student and mark it as taken. */
  function take(studentId: string, seat: SeatInput) {
    free.delete(seat.id);
    occupied.add(key(seat.roomId, seat.row, seat.col));
    assignments.set(studentId, seat.id);
  }

  // Split students into the three priority groups, each in random order.
  const accessibleStudents = shuffle(students.filter((s) => s.needsAccessible), random);
  const leftHandedStudents = shuffle(students.filter((s) => !s.needsAccessible && s.leftHanded), random);
  const others = shuffle(students.filter((s) => !s.needsAccessible && !s.leftHanded), random);

  // Group 1: students who need an accessible seat.
  for (const student of accessibleStudents) {
    // Prefer seats that are also left-handed if the student is left-handed.
    let seat = pick(usable.filter((s) => s.accessible), (s) => [
      student.leftHanded && !s.leftHanded ? 1 : 0,
      occupiedNeighbours(s),
      offPattern(s),
    ]);
    if (!seat) {
      warnings.push("Not enough accessible seats; some students who need one were given a regular seat");
      seat = pick(usable, (s) => [occupiedNeighbours(s), offPattern(s)]);
    }
    if (seat) take(student.id, seat);
    else unassigned.push(student.id);
  }

  // Group 2: left-handed students.
  for (const student of leftHandedStudents) {
    let seat = pick(usable.filter((s) => s.leftHanded), (s) => [
      s.accessible ? 1 : 0, // keep accessible seats for those who need them
      occupiedNeighbours(s),
      offPattern(s),
    ]);
    if (!seat) {
      warnings.push("Not enough left-handed seats; some left-handed students were given a regular seat");
      seat = pick(usable, (s) => [s.accessible ? 1 : 0, occupiedNeighbours(s), offPattern(s)]);
    }
    if (seat) take(student.id, seat);
    else unassigned.push(student.id);
  }

  // Group 3: everyone else. Spacing matters most, then keeping special seats free.
  for (const student of others) {
    const seat = pick(usable, (s) => [occupiedNeighbours(s), isSpecial(s) ? 1 : 0, offPattern(s)]);
    if (seat) take(student.id, seat);
    else unassigned.push(student.id);
  }

  if (unassigned.length > 0) {
    warnings.push(`Not enough usable seats: ${unassigned.length} student(s) could not be seated`);
  }
  // The same warning can be added once per student; only report it once.
  return { assignments, unassigned, warnings: [...new Set(warnings)] };
}

/**
 * Compare two score arrays like words in a dictionary: the first differing
 * number decides. Negative means `a` is the better (lower) score.
 */
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
