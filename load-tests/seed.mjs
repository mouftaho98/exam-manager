// Creates the data the check-in load test needs and writes the k6 fixtures file.
//
//   API_URL=https://uoft-rollcall-api.duckdns.org TOKEN=<approved instructor token> \
//   STUDENTS=2400 node load-tests/seed.mjs fixtures.json
//
// It makes a course, an offering, one large room, a roster of synthetic students
// (loadtest-N@example.com), an exam with generated seating, and then writes one
// {"roomId","studentId"} body per student. Prints EXAM_ID for the k6 run.
// Run it once per test run, because a student can only be checked in once.
import { writeFileSync } from 'node:fs';

const { API_URL, TOKEN } = process.env;
const students = Number(process.env.STUDENTS || 2400);
const out = process.argv[2];
if (!API_URL || !TOKEN || !out) {
  console.error('Usage: API_URL=... TOKEN=... [STUDENTS=2400] node load-tests/seed.mjs <fixtures.json>');
  process.exit(1);
}

async function call(method, path, body, contentType = 'application/json') {
  const res = await fetch(API_URL + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': contentType },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const run = Date.now().toString(36);

const { course } = await call('POST', '/courses', { code: `LOAD${run}`.toUpperCase(), name: 'Load test' });
const { offering } = await call('POST', `/courses/${course.id}/offerings`, { year: 2026, semester: 'FALL' });

// About twice as many seats as students, because seating leaves gaps between students.
const seatsPerRow = 100;
const rows = Math.ceil((students * 2) / seatsPerRow);
if (rows > 200) throw new Error('STUDENTS is too large for one room (max 200 rows x 100 seats)');
const { room } = await call('POST', '/rooms', {
  name: `Load test ${run}`,
  rows: Array.from({ length: rows }, () => ({ seats: seatsPerRow })),
});

// Upload the roster in chunks so each request stays well under the transaction timeout.
for (let start = 0; start < students; start += 400) {
  const lines = ['email,student_number'];
  for (let i = start; i < Math.min(start + 400, students); i++) {
    lines.push(`loadtest-${run}-${i}@example.com,${run}${String(i).padStart(6, '0')}`);
  }
  const result = await call('POST', `/offerings/${offering.id}/roster`, lines.join('\n'), 'text/csv');
  if (result.errors.length > 0) throw new Error(`Roster errors: ${JSON.stringify(result.errors.slice(0, 3))}`);
}

const { exam } = await call('POST', `/offerings/${offering.id}/exams`, {
  title: 'Load test exam',
  startsAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  durationMinutes: 120,
  roomIds: [room.id],
});
const seating = await call('POST', `/exams/${exam.id}/seating/generate`, {});
if (seating.assigned !== students) throw new Error(`Seated ${seating.assigned} of ${students} students`);

const map = await call('GET', `/exams/${exam.id}/seating`);
const bodies = map.rooms
  .flatMap((r) => r.rows.flatMap((row) => row.seats))
  .filter((seat) => seat.student)
  .map((seat) => ({ roomId: room.id, studentId: seat.student.studentId }));
// Shuffle so the load doesn't walk the seating map in order.
for (let i = bodies.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [bodies[i], bodies[j]] = [bodies[j], bodies[i]];
}
writeFileSync(out, JSON.stringify(bodies));
console.log(`Wrote ${bodies.length} bodies to ${out}`);
console.log(`EXAM_ID=${exam.id}`);
console.log(`Delete afterwards: course ${course.code} (offering ${offering.id})`);
