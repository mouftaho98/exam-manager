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
- **Roles are per offering.** A user can be `INSTRUCTOR`, `PROCTOR` or `STUDENT`, and the role can differ from offering to offering. Whoever creates an offering is its instructor.
- **People live on `User`.** Name, student number and accessibility settings (`needsAccessible`, `leftHanded`) are stored once per person and shared by every offering they're in.
- **Invites.** Uploading a roster or adding a member creates the person's `User` if they don't have one yet (with no password), plus an `OfferingMember` with an invite link. The person registers or signs in *with the invited email*, then accepts. Registering with that email takes over the existing record, so roster details carry over. Until they accept, their status is `INVITED`.
- **What a roster can change.** For a person who already exists: accessibility flags and student number are updated, but only when the CSV has that column. Their name is only updated if they haven't registered yet.

## Errors

Every error looks like `{ "error": { "code": "...", "message": "...", "details": ... } }`.
Codes to handle in the UI: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `email_taken`, `course_exists`, `offering_exists`, `already_member`, `last_instructor`.

## Endpoints

All routes except `/auth/*`, `GET /invites/:token`, `/health` and `/ready` need `Authorization: Bearer <token>`.

### Auth and me
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/auth/register` | anyone | `{ email, password (8+), firstName, lastName }` → `{ token, user }` |
| POST | `/auth/login` | anyone | `{ email, password }` → `{ token, user }` |
| GET | `/me` | signed in | user (name, student number, accessibility) + every offering with my role |
| PATCH | `/me` | signed in | `{ firstName?, lastName? }` |

### Invites
| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/invites/:token` | anyone | offering (with course), email, role, `accountExists` (decides "sign in" vs "create account") |
| POST | `/invites/:token/accept` | signed in with the invited email | joins the offering; the link stops working afterwards |

### Courses (catalog)
| Method | Path | Who | Body / notes |
|---|---|---|---|
| POST | `/courses` | signed in | `{ code, name }`. Code is stored uppercase without spaces. 409 `course_exists` (with `details.courseId`) if taken |
| GET | `/courses?q=` | signed in | search by code or name |
| GET | `/courses/:id` | signed in | course + its offerings, newest first, with `myRole` (null if not a member) |
| PATCH | `/courses/:id` | creator or an instructor of one of its offerings | `{ name }` |
| POST | `/courses/:id/offerings` | signed in | `{ year, semester }`; creator becomes instructor. 409 `offering_exists` |

### Offerings and members
| Method | Path | Who | Body / notes |
|---|---|---|---|
| GET | `/offerings/:id` | member | offering, `myRole`, member counts |
| PATCH / DELETE | `/offerings/:id` | instructor | `{ year?, semester? }` |
| GET | `/offerings/:id/members?role=` | staff | instructors also get each member's `inviteUrl` |
| POST | `/offerings/:id/members` | instructor | `{ email, role, studentNumber?, firstName?, lastName?, needsAccessible?, leftHanded? }` |
| POST | `/offerings/:id/roster` | instructor | **`Content-Type: text/csv`**, columns `email, student_number, first_name, last_name, accessible, left_handed` (only email required). Adds or updates by email and never removes anyone. Returns `{ created, updated, errors[], invites[] }` |
| PATCH / DELETE | `/offerings/:id/members/:memberId` | instructor | PATCH takes `role` and the person fields above |
| POST | `/offerings/:id/members/:memberId/invite` | instructor | new invite link; the old one stops working |
