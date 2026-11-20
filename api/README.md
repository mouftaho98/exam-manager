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

Tests use `TEST_DATABASE_URL` (default `postgresql://exam:exam@localhost:55432/exam_manager_test`) and wipe it.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | — | required |
| `PORT` | 3000 | |
| `CORS_ORIGIN` | `*` | comma-separated origins |

The container runs `prisma migrate deploy` before starting, so a new image applies its own migrations.

## For deployment (Kubernetes)

- Liveness probe: `GET /health`. Readiness probe: `GET /ready` (checks the database).
- The process shuts down cleanly on `SIGTERM`.

## Errors

Every error looks like `{ "error": { "code": "...", "message": "...", "details": ... } }`.
