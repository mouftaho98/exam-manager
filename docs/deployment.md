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

For a fresh deployment, use two private environment files outside the checkout. The database file has `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. The API file has `DATABASE_URL` and, when the backend uses them, `JWT_SECRET` and `CORS_ORIGIN`. In the URL, use `postgres` as the database host and percent-encode reserved characters in the credentials. Set `POSTGRES_ENV_FILE` and `API_ENV_FILE` in your shell to the two file paths. The staging Secrets already exist, so skip the two Secret creation commands when redeploying there.

```sh
kubectl -n exam-manager create secret generic postgres-credentials --from-env-file="$POSTGRES_ENV_FILE"
kubectl -n exam-manager create secret generic api-credentials --from-env-file="$API_ENV_FILE"
kubectl -n exam-manager apply -f k8s/postgres.yaml -f k8s/redis.yaml
kubectl -n exam-manager rollout status statefulset/postgres --timeout=5m
kubectl -n exam-manager get pvc
kubectl -n exam-manager rollout status deployment/redis --timeout=2m
sed -e "s|API_IMAGE|$API_IMAGE|" -e '/^      containers:/i\
      imagePullSecrets:\
        - name: '"$REGISTRY"'
' k8s/api.yaml | kubectl -n exam-manager apply -f -
kubectl -n exam-manager rollout status deployment/api --timeout=2m
kubectl -n exam-manager port-forward svc/api 3000:3000
```

From another terminal, repeat the two HTTP checks in step 1. For a staging persistence test, connect with the following command and use a dedicated disposable table. Insert a row, recreate just the PostgreSQL pod, reconnect after rollout, and confirm the row is present. Keep the PVC intact. The default DigitalOcean reclaim policy deletes the volume when its PVC is deleted.

```sh
kubectl -n exam-manager exec -it postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The initial claim is 10 GiB. Plan backups before storing real data. When the UI and check-in API are available, add HTTPS routing for the frontend and API. Coordinate the Socket.IO Redis adapter and session affinity for HTTP long-polling with the frontend and backend members.

For an API-only update, set `API_IMAGE` to the new pushed digest and run `kubectl -n exam-manager set image deployment/api api="$API_IMAGE"`. Wait for the rollout and verify `/ready` and the changed feature.

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

The API requests 200 millicores and 128 MiB per pod as starting values. The HPA targets 70% of requested CPU and manages 2–6 replicas. Make sure six API pods fit alongside the other workloads. Use the DigitalOcean Kubernetes Insights graphs for historical node CPU and memory. Use `kubectl top pods` for live pod metrics and inspect restart counts with `kubectl get pods`. The `api-health` CronJob checks the internal Service every minute. Inspect outcomes with `kubectl -n exam-manager get jobs` and `kubectl -n exam-manager logs job/<job-name>`. Add an external HTTPS uptime check and alert after the public route is available.

## 5. Exercise concurrent student check-ins

Once the team confirms the POST route, authentication, request body, and success status, seed a staging exam with synthetic students. Keep fixture files and credentials outside Git. Supply a JSON array of unique request bodies and export the token, target URL, and route using the variables in `load-tests/check-in.js`. Set `CHECK_INS_PER_SECOND` to the expected rate and `EXPECTED_STATUS` to the route's success status. Verify one request manually before running the workload.

```sh
k6 run load-tests/check-in.js
```

The script ramps for 30 seconds, holds for three minutes, and ramps down for 30 seconds. Set a fresh fixture set for each run. The default thresholds are provisional course-demo targets. Review p95 latency, response failures and dropped iterations against CPU, memory, and HPA replica counts. Verify that recorded check-ins match successful unique requests. In a separate concurrency test, submit the same student's check-in simultaneously and confirm it produces one record and the agreed response for retries. Repeat an arrival spike and capture scale-up and scale-down for the report.

## References

- [DigitalOcean Kubernetes volumes](https://docs.digitalocean.com/products/kubernetes/how-to/add-volumes/)
- [DigitalOcean Kubernetes autoscaling](https://docs.digitalocean.com/products/kubernetes/how-to/set-up-autoscaling/)
- [DigitalOcean Kubernetes monitoring](https://docs.digitalocean.com/products/kubernetes/how-to/monitoring/)
- [k6 ramping arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
