# Exam Manager

A cloud-native exam-day manager for university courses: automatic exam seating and live, multi-room check-in.

ECE1779 Introduction to Cloud Computing, Fall 2026, University of Toronto.

**Live site:** http://uoft-rollcall.duckdns.org (API: http://uoft-rollcall-api.duckdns.org, health check at [`/ready`](http://uoft-rollcall-api.duckdns.org/ready))

> Final report (README.md, max 5000 words). Sections below follow the course handout.

## Team Information
| Name | Student number | Email |
|---|---|---|
| Omar Mouftah | | |
| Ahmed Afifi | 1003139873 | ahmed.afifi@mail.utoronto.ca |
| Mohammed Abdulmunem | | |

## Motivation

## Objectives

## Technical Stack

## Features

## User Guide

## Development Guide

### UI tests (Playwright)

End-to-end tests in [`e2e/`](e2e/) drive the real web app in Chromium against a real API and Postgres. See [`e2e/README.md`](e2e/README.md) for the full list of flows covered and the ones still to build.

```bash
cd api && npm ci && npx prisma generate && cd ..
cd web && npm ci && cd ..
cd e2e && npm ci && npx playwright install chromium
npm test            # starts the API on :3100 and the web app on :5174 itself
npm run test:live   # read-only smoke checks against the live site
```

The tests need a Postgres database. By default they use `postgresql://exam:exam@localhost:55432/exam_manager_e2e`; set `E2E_DATABASE_URL` to use another. CI runs them on every PR that touches `web/`, `api/` or `e2e/` (`.github/workflows/e2e.yml`).

## Deployment Information

RollCall runs on DigitalOcean Kubernetes (DOKS):

| What | URL |
|---|---|
| Web app | http://uoft-rollcall.duckdns.org |
| API | http://uoft-rollcall-api.duckdns.org |
| API liveness / readiness | http://uoft-rollcall-api.duckdns.org/health, http://uoft-rollcall-api.duckdns.org/ready |

The names come from [DuckDNS](https://www.duckdns.org) and point at the two DigitalOcean load balancers (web `146.190.191.196`, API `209.38.1.216`), which still answer on their IPs too.

The web app and the API each sit behind their own DigitalOcean load balancer. Both are plain HTTP for now. Phone cameras only work over HTTPS, so scanning student ID cards with a phone won't work on the live site until HTTPS is set up; typing the student number works everywhere. Kubernetes manifests are in `k8s/`.

**Domain:** the DuckDNS names are free and set up in [docs/domain.md](docs/domain.md), which also covers moving to a `.tech` domain from the GitHub Student Developer Pack and adding HTTPS. Every push to `main` deploys automatically (`.github/workflows/deploy.yml`, see [docs/deployment.md](docs/deployment.md#continuous-deployment)).

See the [deployment runbook](docs/deployment.md) for local setup, DigitalOcean Kubernetes deployment, monitoring, and load testing.

## AI Assistance & Verification (Summary)
See [ai-session.md](ai-session.md).

## Individual Contributions

## Lessons Learned and Concluding Remarks

## Video Demo
