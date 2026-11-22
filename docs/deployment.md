# Exam Day Manager deployment

## 1. Verify local Docker Compose

From the repository root, create an ignored `.env` from `.env.example` if you don't already have one. Use local credentials and keep the PostgreSQL password in sync with `DATABASE_URL`.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/ready
docker compose exec redis redis-cli ping
```

Both HTTP checks should respond with `{"ok":true}`. Redis should answer `PONG`. If readiness fails, inspect `docker compose logs api postgres`. The frontend and check-in endpoints need to land before Compose can exercise the full application.

## 2. Connect to DOKS and publish an image

Staging uses the `exam-manager` DOKS cluster in Toronto and the `exam-manager-ece1779` registry. Link the registry under the cluster's **Settings → DigitalOcean Container Registry Integration**. Use the cluster's **Actions → Download Config** menu to download your own kubeconfig. Keep it outside the repository and replace the filename below if yours differs. The build targets the staging workers' AMD64 architecture.

```sh
export KUBECONFIG="$HOME/Downloads/exam-manager-kubeconfig.yaml"
kubectl config current-context
kubectl get nodes -L kubernetes.io/arch
kubectl get storageclass do-block-storage
```

Confirm the context is `do-tor1-exam-manager` and the workers are `Ready`. Authenticate Docker with a registry credential that has write access. Build from a clean, committed checkout so the image tag identifies the code.

```sh
REGISTRY=exam-manager-ece1779
IMAGE_REPOSITORY="registry.digitalocean.com/$REGISTRY/exam-manager-api"
docker buildx build --platform linux/amd64 --provenance=false \
  --tag "$IMAGE_REPOSITORY:$(git rev-parse --short HEAD)" --push ./api
```

Copy the `sha256:…` digest printed by the push. Use the same terminal for these steps.

```sh
API_IMAGE="$IMAGE_REPOSITORY@sha256:REPLACE_WITH_PUSHED_DIGEST"
kubectl apply -f k8s/namespace.yaml
kubectl -n exam-manager get secret "$REGISTRY"
```

The registry integration supplies the pull Secret in the namespace. Confirm it exists before deploying the API.

## 3. Deploy the database, Redis, and API

Use two private environment files outside the checkout, with their paths in `POSTGRES_ENV_FILE` and `API_ENV_FILE`. The database file requires `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. The API file requires all four keys.

| Key | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL using `postgres` as the host. Percent-encode reserved characters in the credentials. |
| `JWT_SECRET` | Strong signing secret. Preserve the existing value during redeployments so issued tokens remain valid. |
| `WEB_URL` | Public frontend HTTPS URL used to build invite links. Use the URL without a trailing slash. |
| `CORS_ORIGIN` | Frontend origin, including scheme and any non-default port. Omit paths and trailing slashes. |

Create the PostgreSQL Secret once. For staging, retain the existing PostgreSQL Secret and update the API Secret from a complete environment file with the existing database and signing credentials.

```sh
kubectl -n exam-manager create secret generic postgres-credentials --from-env-file="$POSTGRES_ENV_FILE"
kubectl -n exam-manager create secret generic api-credentials \
  --from-env-file="$API_ENV_FILE" --dry-run=client -o yaml |
  kubectl -n exam-manager apply --server-side --field-manager=exam-manager-api-credentials -f -
kubectl -n exam-manager apply -f k8s/postgres.yaml -f k8s/redis.yaml
kubectl -n exam-manager rollout status statefulset/postgres --timeout=5m
kubectl -n exam-manager get pvc
kubectl -n exam-manager rollout status deployment/redis --timeout=2m
sed -e "s|API_IMAGE|$API_IMAGE|" -e '/^      containers:/i\
      imagePullSecrets:\
        - name: '"$REGISTRY"'
' k8s/api.yaml | kubectl -n exam-manager apply -f -
kubectl -n exam-manager rollout status deployment/api --timeout=2m
```

For a local diagnostic, run `kubectl -n exam-manager port-forward svc/api 3000:3000` and repeat the two HTTP checks in step 1 from another terminal. For a staging persistence test, connect with the following command and use a dedicated disposable table. Insert a row, recreate just the PostgreSQL pod, reconnect after rollout, and confirm the row is present. Keep the PVC intact. The default DigitalOcean reclaim policy deletes the volume when its PVC is deleted.

```sh
kubectl -n exam-manager exec -it postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The initial claim is 10 GiB. Plan backups before storing real data.

### Expose the API over public HTTPS

Use a public API hostname and a matching certificate in the DigitalOcean project. Set `API_HOST` to that hostname and `API_TLS_CERTIFICATE_NAME` to the exact name of the issued certificate returned by `doctl compute certificate list`. Apply the public Service and wait for its external IP.

```sh
sed "s|API_TLS_CERTIFICATE_NAME|${API_TLS_CERTIFICATE_NAME:?Set the certificate name}|" k8s/api-public.yaml |
  kubectl -n exam-manager apply -f -
kubectl -n exam-manager get svc api-public -w
```

Point the API hostname's DNS A record to the external IP. Configure the frontend to use `https://$API_HOST` as its API and Socket.IO origin. Verify both health endpoints and the WebSocket handshake from outside the cluster.

```sh
curl -fsS "https://$API_HOST/health"
curl -fsS "https://$API_HOST/ready"
npx wscat -c "wss://$API_HOST/socket.io/?EIO=4&transport=websocket"
```

The regional load balancer terminates TLS and supports WebSocket upgrades. Client connections use `transports: ["websocket"]`, so session affinity is unnecessary. The internal Service continues to serve in-cluster health checks. [DigitalOcean load balancer configuration](https://docs.digitalocean.com/products/kubernetes/how-to/configure-load-balancers/) · [WebSocket support](https://docs.digitalocean.com/products/networking/load-balancers/details/features/#websocket-support)

For a manual API-only update, set `API_IMAGE` to the new pushed digest and run `kubectl -n exam-manager set image deployment/api api="$API_IMAGE"`. Wait for rollout and verify `/ready` and the changed feature.

## 4. Enable autoscaling and monitoring

Staging uses Metrics Server v0.9.1. If the metrics API is absent on a fresh cluster, install the same release and wait for it to become available.

```sh
kubectl get apiservice v1beta1.metrics.k8s.io --ignore-not-found
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.1/components.yaml
kubectl -n kube-system rollout status deployment/metrics-server --timeout=120s
kubectl wait --for=condition=Available apiservice/v1beta1.metrics.k8s.io --timeout=60s
```

Confirm `kubectl top nodes` and `kubectl -n exam-manager top pods` return data, then apply the HPA and internal health checker.

```sh
kubectl -n exam-manager apply -f k8s/hpa.yaml -f k8s/health-monitor.yaml
kubectl -n exam-manager describe hpa api
kubectl -n exam-manager get hpa,pods -w
```

The API requests 200 millicores and 128 MiB per pod as starting values. The HPA targets 70% of requested CPU and manages 2–6 replicas. Make sure six API pods fit alongside the other workloads. Use the DigitalOcean Kubernetes Insights graphs for historical node CPU and memory. Use `kubectl top pods` for live pod metrics and inspect restart counts with `kubectl get pods`. The `api-health` CronJob checks the internal Service every minute. Inspect outcomes with `kubectl -n exam-manager get jobs` and `kubectl -n exam-manager logs job/<job-name>`.

### Configure DigitalOcean alerts

In Monitoring, create two resource alert policies scoped to the staging Kubernetes worker tag. Set CPU utilization above 80% for five minutes and memory utilization above 85% for five minutes. Set the notification destination to the team's email or Slack channel. [DigitalOcean resource alerts](https://docs.digitalocean.com/products/monitoring/how-to/manage-resource-alerts/)

In Uptime, create an HTTPS check for `https://$API_HOST/ready`. Add a downtime alert to the same destination and confirm the check reports healthy. Capture the enabled worker policies and the healthy uptime check with its alert settings for the report. [DigitalOcean Uptime alerts](https://docs.digitalocean.com/products/uptime/how-to/create-alerts/)

## 5. Exercise concurrent student check-ins

Deploy the backend from PR #7 or later. Seed a staging exam with synthetic students who have assigned seats and fresh check-in codes. Save a JSON array of unique bodies in a private file. Each body has the shape `{"roomId":"<assigned room ID>","code":"ABC234"}`. Use a token from a proctor or instructor assigned to that exam. Keep fixtures and credentials outside Git.

Set `API_HOST`, `EXAM_ID`, `TOKEN`, and `FIXTURES` in your shell. Probe the route with a separate fixture before the run. The first check-in returns HTTP 201, and a repeat returns HTTP 200. The workload defaults to 201 and requires at least 240 unique bodies per check-in per second.

```sh
BASE_URL="https://$API_HOST" CHECK_IN_PATH="/exams/$EXAM_ID/checkins" \
  TOKEN="$TOKEN" FIXTURES="$FIXTURES" CHECK_INS_PER_SECOND=10 \
  k6 run load-tests/check-in.js
```

In a separate terminal, run `kubectl -n exam-manager get hpa api -w` from before the load starts until replicas return to baseline. Capture the k6 summary, replica counts, and timestamps for the report.

The script ramps for 30 seconds, holds for three minutes, and ramps down for 30 seconds. Set a fresh fixture set for each run. The default thresholds are provisional course-demo targets. Review p95 latency, response failures and dropped iterations against CPU, memory, and HPA replica counts. Verify that recorded check-ins match successful unique requests. In a separate concurrency test, submit the same student's check-in simultaneously and confirm it produces one record and HTTP 200 for retries. Repeat an arrival spike and capture scale-up and scale-down for the report.

### Verify live updates between pods

Choose two ready API pods with `kubectl -n exam-manager get pods -l app=api`. Port-forward directly to each pod on a different local port. Connect an authenticated proctor Socket.IO client to pod B over WebSocket and subscribe to the test exam. Submit a new check-in with the instructor or proctor bearer token through pod A. Verify the POST returns 201 and the socket on pod B receives `checkin:created` for that student's room. Capture both pod names and the matching event for the report, with credentials redacted.

## References

- [DigitalOcean Kubernetes volumes](https://docs.digitalocean.com/products/kubernetes/how-to/add-volumes/)
- [DigitalOcean Kubernetes autoscaling](https://docs.digitalocean.com/products/kubernetes/how-to/set-up-autoscaling/)
- [DigitalOcean Kubernetes monitoring](https://docs.digitalocean.com/products/kubernetes/how-to/monitoring/)
- [k6 ramping arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
