# Autoscaling evidence

A load test of the production API showing the Horizontal Pod Autoscaler (HPA) adding pods. The video and final screenshot are attached to the pull request that carries this file.

## Setup

- API Deployment: each pod requests 200m CPU and has no CPU limit (`k8s/api.yaml`).
- HPA (`k8s/hpa.yaml`): 2 to 6 replicas, target 70% of requested CPU, five minutes of low load before scaling down.
- Cluster: DigitalOcean Kubernetes, two worker nodes, metrics-server installed.

## Method

[`load-tests/login-burn.mjs`](../load-tests/login-burn.mjs) sends wrong-password logins for an existing account at a constant rate. Each one runs a bcrypt comparison on the API, so CPU use rises with the request rate and no test data is needed.

```bash
node load-tests/login-burn.mjs https://uoft-rollcall-api.duckdns.org <existing account email> 15 90
```

While it runs:

```bash
kubectl -n exam-manager get hpa api -w
kubectl -n exam-manager get pods -l app=api -w
kubectl -n exam-manager top pods
```

## Results

15 requests per second for 150 seconds, starting from 2 pods at 1% CPU:

| Time after start | Replicas |
|---|---|
| 0 s | 2 |
| ~25 s | 3 |
| ~45 s | 6 (maximum), held until the load stopped |

- 2,248 of 2,249 requests returned the expected 401; one returned 503 while new pods started.
- Slowest 5% of requests took 1.3 to 1.6 s while the pods were scaling, and about 300 ms once all six were running.
- No pod restarts.
- The HPA scaled back to 2 about five minutes after the load ended.

## Heavier load (40 requests per second)

For comparison, 40 requests per second for 3 minutes scaled to 6 pods within about 30 s, but CPU stayed near 300% of the request. About 39% of requests returned 503, and every API pod restarted 3 to 4 times because the liveness probe failed: password hashing (bcryptjs) runs on the main thread and starved the health check. The site recovered on its own.

Findings for follow-up:

- The login endpoint has no rate limiting (about 7,000 failed logins on one account caused no lockout).
- The liveness probe is sensitive to a blocked event loop. A longer probe timeout, or non-blocking hashing, would avoid the restarts.
- The real check-in endpoint is much lighter than a bcrypt login.

## Attachments

Added in the pull request description:

- Screen recording of the scale-up (replicas 2, 3, 6).
- Final screenshot with six pods running.
