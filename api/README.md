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

- **Courses and offerings.** A course is a catalog entry (`ECE1779 Cloud Computing`). An offering is one term of it (`ECE1779, Fall 2026`), with its own instructors, proctors and students. Course codes are unique; each course runs at most once per semester (`WINTER`, `SUMMER`, `FALL`).
- **Becoming an instructor.** Anyone can ask to be an instructor, by ticking it at sign-up (`wantsToTeach: true`) or later with `POST /me/instructor-request`. Their `instructorStatus` stays `PENDING` until an admin approves it. Only `APPROVED` instructors can add courses or start offerings.
- **Admins** approve instructor requests. Make the first admin from the command line once they've registered: `npm run make-admin -- you@uni.ca` locally, or `node dist/scripts/make-admin.js you@uni.ca` inside the container.
- **Roles are per offering.** A user can be `INSTRUCTOR`, `PROCTOR` or `STUDENT`, and the role can differ from offering to offering. Whoever starts an offering is its first instructor. Instructors invite students, proctors or co-instructors and choose the role for each; students are also invited automatically by the roster upload. Proctors run exam day: check-in and moving seats.
- **People live on `User`.** Name, student number and accessibility settings (`needsAccessible`, `leftHanded`) are stored once per person and shared by every offering they're in. **Students set their own accessibility and left-handed needs** at sign-up or with `PATCH /me`; instructors can't, since they don't have that information.
- **Invites.** Uploading a roster or adding a member creates the person's `User` if they don't have one yet (with no password), plus an `OfferingMember` with an invite link. The person registers or signs in *with the invited email*, then accepts. Registering with that email takes over the existing record, so roster details carry over. Until they accept, their status is `INVITED`.
- **Rooms** are shared between courses. Each row can have a different length, and gaps in `col` are aisles.
- **Seating** places students who need an accessible seat first, then left-handed students, then everyone else at random. It keeps one empty seat between students while the room allows it, and never uses broken seats. Instructors and proctors can both move, swap or unseat students afterwards. Accessible and left-handed seats are a preference: if a room has none or too few, those students get ordinary seats and the result includes a warning. Invited students who haven't accepted yet still get a seat. Accessibility and left-handed needs come from each student's own profile.
- **Check-in codes.** Each student gets one 6-character code per exam; the QR code just encodes it. The code survives regenerating the seating and manual moves.
- **What a roster can change.** For a person who already exists, the student number is updated. Their name is only updated if they haven't registered yet.

## Errors

Every error looks like `{ "error": { "code": "...", "message": "...", "details": ... } }`.
Codes to handle in the UI: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `email_taken`, `instructor_not_approved`, `already_instructor`, `course_exists`, `offering_exists`, `already_member`, `last_instructor`, `seat_taken`, `room_in_use`.

## Endpoints

All routes except `/auth/*`, `GET /invites/:token`, `/health` and `/ready` need `Authorization: Bearer <token>`.

### Auth and me
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `{ email, password (8+), firstName, lastName, wantsToTeach?, needsAccessible?, leftHanded? }` → `{ token, user }`. `wantsToTeach: true` asks for instructor access |
| POST | `/auth/login` | anyone | `{ email, password }` → `{ token, user }` |
| GET | `/me` | signed in | user (name, student number, accessibility) + every offering with my role |
| PATCH | `/me` | signed in | `{ firstName?, lastName?, needsAccessible?, leftHanded? }` |
| POST | `/me/instructor-request` | signed in | ask for instructor access (status becomes `PENDING`) |
| GET | `/me/exams` | signed in | my exams as a student: offering, seat, room, `checkinCode` |

### Invites
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/invites/:token` | anyone | offering (with course), email, role, `accountExists` (decides "sign in" vs "create account") |
| POST | `/invites/:token/accept` | signed in with the invited email | joins the offering; the link stops working afterwards |

### Courses (catalog)
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/courses` | approved instructor | `{ code, name }`. Code is stored uppercase without spaces. 409 `course_exists` (with `details.courseId`) if taken |
| GET | `/courses?q=` | signed in | search by code or name |
| GET | `/courses/:id` | signed in | course + its offerings, newest first, with `myRole` (null if not a member) |
| PATCH | `/courses/:id` | creator or an instructor of one of its offerings | `{ name }` |
| POST | `/courses/:id/offerings` | approved instructor | `{ year, semester }`; creator becomes instructor. 409 `offering_exists` |

### Admin
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/admin/instructor-requests?status=` | admin | `PENDING` (default), `APPROVED` or `REJECTED` |
| POST | `/admin/instructor-requests/:userId/approve` | admin | |
| POST | `/admin/instructor-requests/:userId/reject` | admin | they can ask again later |

### Offerings and members
| Method | Path | Who | Body / notes |
|---|---|---|---|
| GET | `/offerings/:id` | member | offering, `myRole`, member counts |
| PATCH / DELETE | `/offerings/:id` | instructor | `{ year?, semester? }` |
| GET | `/offerings/:id/members?role=` | staff | instructors also get each member's `inviteUrl` |
| POST | `/offerings/:id/members` | instructor | `{ email, role, studentNumber?, firstName?, lastName? }` |
| POST | `/offerings/:id/roster` | instructor | **`Content-Type: text/csv`**, columns `email, student_number, first_name, last_name` (only email required; other columns are ignored). Adds or updates by email and never removes anyone. Returns `{ created, updated, errors[], invites[] }` |
| PATCH / DELETE | `/offerings/:id/members/:memberId` | instructor | PATCH takes `role` and the person fields above |
| POST | `/offerings/:id/members/:memberId/invite` | instructor | new invite link; the old one stops working |

### Rooms
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/rooms` | instructors and proctors | `{ name, building?, rows: [{ label?, seats: 12 }]` or `seats: [{ col, label?, accessible?, leftHanded?, broken? }] }`. Seat labels default to row letter + (col+1), e.g. `C7` |
| GET | `/rooms?q=` | signed in | list with capacity |
| GET | `/rooms/:id` | signed in | layout as `rows[].seats[]` |
| PUT | `/rooms/:id` | room creator or exam staff | replace the layout; refused while students are seated there |
| PATCH | `/rooms/:id/seats/:seatId` | room creator or exam staff | `{ accessible?, leftHanded?, broken? }` |

### Exams and seating
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/offerings/:id/exams` | instructor | `{ title, startsAt (ISO), durationMinutes, roomIds? }` |
| GET | `/offerings/:id/exams` | member | |
| GET | `/exams/:id` | member | staff get counts; students get `mySeat` (code, seat and room map) |
| PATCH / DELETE | `/exams/:id` | instructor | |
| PUT | `/exams/:id/rooms` | instructor | `{ roomIds }` |
| POST | `/exams/:id/seating/generate` | instructor | `{ seed? }` → `{ assigned, unassigned[], warnings[], seed }` |
| GET | `/exams/:id/seating` | staff | every seat with its student, plus unseated students |
| PATCH | `/exams/:id/assignments/:studentId` | instructor or proctor | `{ seatId, swap? }`; 409 `seat_taken` unless `swap: true` |
| DELETE | `/exams/:id/assignments/:studentId` | instructor or proctor | unseat a student |
