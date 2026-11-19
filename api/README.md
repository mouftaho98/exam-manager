# RollCall API

Node 22 + TypeScript, Express 5, Prisma (PostgreSQL).

## Run it

Whole stack (API, Postgres, Redis) from the repo root:

```bash
cp .env.example .env
docker compose up --build
```

API only, against your own Postgres (useful while developing):

```bash
cd api
npm install
DATABASE_URL=postgresql://exam:exam@localhost:55432/exam_manager npx prisma migrate dev
DATABASE_URL=postgresql://exam:exam@localhost:55432/exam_manager npm run dev
```

A throwaway Postgres for that:

```bash
docker run -d --name rollcall-pg -e POSTGRES_USER=exam -e POSTGRES_PASSWORD=exam -e POSTGRES_DB=exam_manager -p 55432:5432 postgres:16
```

## Tests

```bash
docker exec rollcall-pg psql -U exam -d exam_manager -c "CREATE DATABASE exam_manager_test"   # once
npm test
```

Integration tests use `TEST_DATABASE_URL` (default `postgresql://exam:exam@localhost:55432/exam_manager_test`) and wipe it.
`npm run test:unit` runs only the seating and CSV tests, which need no database.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | required |
| `JWT_SECRET` | dev value | required when `NODE_ENV=production` |
| `PORT` | 3000 | |
| `WEB_URL` | `http://localhost:5173` | used to build invite links (`<WEB_URL>/invite/<token>`) |
| `CORS_ORIGIN` | `*` | comma-separated origins |

The container runs `prisma migrate deploy` before starting, so a new image applies its own migrations.

## For deployment (Kubernetes)

- Liveness probe: `GET /health`. Readiness probe: `GET /ready` (checks the database).
- The process shuts down cleanly on `SIGTERM`.

## Concepts

- **Roles are per course.** A user can be `INSTRUCTOR`, `PROCTOR` or `STUDENT`, and the role can differ from course to course. Whoever creates a course is its instructor.
- **Invites.** Uploading a roster or adding a member creates a `CourseMember` with an invite link. The person signs in or creates an account *with the invited email*, then accepts. Until then their status is `INVITED`, but they still get a seat.
- **Rooms** are shared between courses. Each row can have a different length, and gaps in `col` are aisles.
- **Seating** places students who need an accessible seat first, then left-handed students, then everyone else at random. It keeps one empty seat between students while the room allows it, and never uses broken seats. Staff can move or swap students afterwards.
- **Check-in codes.** Each student gets one 6-character code per exam; the QR code just encodes it. The code survives regenerating the seating and manual moves.

## Errors

Every error looks like `{ "error": { "code": "...", "message": "...", "details": ... } }`.
Codes to handle in the UI: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `email_taken`, `already_member`, `last_instructor`, `seat_taken`, `room_in_use`.

## Endpoints

All routes except `/auth/*`, `GET /invites/:token`, `/health` and `/ready` need `Authorization: Bearer <token>`.

### Auth and me
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `{ email, password (8+), name }` → `{ token, user }` |
| POST | `/auth/login` | anyone | `{ email, password }` → `{ token, user }` |
| GET | `/me` | signed in | user + every course with my role |
| GET | `/me/exams` | signed in | my exams as a student: seat, room, `checkinCode` |

### Invites
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/invites/:token` | anyone | course, email, role, `accountExists` (decides "sign in" vs "create account") |
| POST | `/invites/:token/accept` | signed in with the invited email | joins the course; the link stops working afterwards |

### Courses and members
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/courses` | signed in | `{ code, name, term? }` |
| GET | `/courses/:id` | member | course, `myRole`, member counts |
| PATCH / DELETE | `/courses/:id` | instructor | |
| GET | `/courses/:id/members?role=` | staff | instructors also get each member's `inviteUrl` |
| POST | `/courses/:id/members` | instructor | `{ email, role, studentNumber?, firstName?, lastName?, needsAccessible?, leftHanded? }` |
| POST | `/courses/:id/roster` | instructor | **`Content-Type: text/csv`**, columns `email, student_number, first_name, last_name, accessible, left_handed` (only email required). Adds or updates by email and never removes anyone. Returns `{ created, updated, errors[], invites[] }` |
| PATCH / DELETE | `/courses/:id/members/:memberId` | instructor | |
| POST | `/courses/:id/members/:memberId/invite` | instructor | new invite link; the old one stops working |

### Rooms
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/rooms` | signed in | `{ name, building?, rows: [{ label?, seats: 12 }]` or `seats: [{ col, label?, accessible?, leftHanded?, broken? }] }`. Seat labels default to row letter + (col+1), e.g. `C7` |
| GET | `/rooms?q=` | signed in | list with capacity |
| GET | `/rooms/:id` | signed in | layout as `rows[].seats[]` |
| PUT | `/rooms/:id` | room creator or exam staff | replace the layout; refused while students are seated there |
| PATCH | `/rooms/:id/seats/:seatId` | room creator or exam staff | `{ accessible?, leftHanded?, broken? }` |

### Exams and seating
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/courses/:id/exams` | instructor | `{ title, startsAt (ISO), durationMinutes, roomIds? }` |
| GET | `/courses/:id/exams` | member | |
| GET | `/exams/:id` | member | staff get counts; students get `mySeat` (code, seat and room map) |
| PATCH / DELETE | `/exams/:id` | instructor | |
| PUT | `/exams/:id/rooms` | instructor | `{ roomIds }` |
| POST | `/exams/:id/seating/generate` | instructor | `{ seed? }` → `{ assigned, unassigned[], warnings[], seed }` |
| GET | `/exams/:id/seating` | staff | every seat with its student, plus unseated students |
| PATCH | `/exams/:id/assignments/:memberId` | staff | `{ seatId, swap? }`; 409 `seat_taken` unless `swap: true` |
| DELETE | `/exams/:id/assignments/:memberId` | staff | unseat a student |
