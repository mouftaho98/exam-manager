# Exam Manager

A cloud-native exam-day manager for university courses: automatic exam seating and live, multi-room check-in.

ECE1779 Introduction to Cloud Computing, Fall 2026, University of Toronto.

**Live site:** http://146.190.191.196 (API: http://209.38.1.216, health check at [`/ready`](http://209.38.1.216/ready))

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
| Web app | http://146.190.191.196 |
| API | http://209.38.1.216 |
| API liveness / readiness | http://209.38.1.216/health, http://209.38.1.216/ready |

The web app and the API each sit behind their own DigitalOcean load balancer. Both are plain HTTP for now, so phone cameras (QR / barcode scanning needs HTTPS outside `localhost`) won't work on the live site until HTTPS is set up. Kubernetes manifests and the runbook are in `k8s/` and `docs/deployment.md` (PR #6).

### Getting a readable name (free)

Options from cheapest to nicest:

1. **sslip.io / nip.io (free, no sign-up):** http://146-190-191-196.sslip.io already resolves to the web app. Still shows the IP, but it's a real hostname, so it can get a free Let's Encrypt HTTPS certificate.
2. **DuckDNS (free, sign in with GitHub):** pick a name like `rollcall-exams.duckdns.org` and point it at `146.190.191.196`.
3. **GitHub Student Developer Pack (free for 1 year):** a `.tech` domain from get.tech or a `.me` from Namecheap (nc.me), e.g. `rollcall.tech`. This is the most human-friendly option. Renewal after the first year is paid, but the course is over by then.

With a real name, the next step is one Ingress (ingress-nginx + cert-manager with Let's Encrypt) serving the web app at `/` and the API at `/api` on the same host. That gives HTTPS (needed for camera scanning) and lets us drop one of the two load balancers.

## AI Assistance & Verification (Summary)
See [ai-session.md](ai-session.md).

## Individual Contributions

## Lessons Learned and Concluding Remarks

## Video Demo
