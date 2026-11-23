# RollCall deployment

RollCall runs as four workloads: `web` (React, served by nginx), `api` (Express and Socket.IO), `postgres` (StatefulSet on a DigitalOcean volume) and `redis` (relays live updates between API pods). Docker Compose runs all four locally. Kubernetes on DigitalOcean (DOKS) runs them in staging.

Staging cluster: `exam-manager` in `tor1`, one pool of two `s-2vcpu-4gb` workers (amd64). Each worker has about 1.9 CPU and 3 GiB allocatable. The registry is `exam-manager-ece1779`.

## 1. Verify local Docker Compose

From the repository root, create an ignored `.env` from `.env.example` if you don't already have one. Use local credentials and keep the PostgreSQL password in sync with `DATABASE_URL`.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/ready
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:5173/proctor
docker compose exec redis redis-cli ping
```

Both API checks should respond with `{"ok":true}`, the web check should print `200`, and Redis should answer `PONG`. The web app is at <http://localhost:5173> and calls the API at <http://localhost:3000>. That address is baked into the web bundle at build time by the `VITE_API_URL` build argument in `docker-compose.yml`. If readiness fails, inspect `docker compose logs api postgres`.

The API applies migrations when it starts. The migration history is a single `init` migration. After pulling a change to `api/prisma/migrations/`, reset a local database with `docker compose down -v`.

## 2. Connect to DOKS and publish images

Link the registry under the cluster's **Settings → DigitalOcean Container Registry Integration**. Use the cluster's **Actions → Download Config** menu to download your own kubeconfig. Keep it outside the repository and replace the filename below if yours differs. Your shell may default to other clusters, so always export `KUBECONFIG` first.

```sh
export KUBECONFIG="$HOME/Downloads/exam-manager-kubeconfig.yaml"
kubectl config current-context
kubectl get nodes -L kubernetes.io/arch
kubectl get storageclass do-block-storage
```

Confirm the context is `do-tor1-exam-manager` and both workers are `Ready` on `amd64`. Authenticate Docker with a registry credential that has write access. Build from a clean, committed checkout so the image tag identifies the code. The API image can be built now.

```sh
REGISTRY=exam-manager-ece1779
TAG="$(git rev-parse --short HEAD)"
API_REPOSITORY="registry.digitalocean.com/$REGISTRY/exam-manager-api"
docker buildx build --platform linux/amd64 --provenance=false \
  --tag "$API_REPOSITORY:$TAG" --push ./api
```

Copy the `sha256:…` digest printed by the push.

```sh
API_IMAGE="$API_REPOSITORY@sha256:REPLACE_WITH_API_DIGEST"
kubectl apply -f k8s/namespace.yaml
kubectl -n exam-manager get secret "$REGISTRY"
```

The registry integration supplies the pull Secret in the namespace. Confirm it exists before deploying.

The web image cannot be built until you know the public API address, because Vite compiles it into the bundle. Set `API_HOST` to the API hostname (for example `uoft-rollcall-api.duckdns.org`) and build it in the same terminal.

```sh
WEB_REPOSITORY="registry.digitalocean.com/$REGISTRY/exam-manager-web"
docker buildx build --platform linux/amd64 --provenance=false \
  --build-arg VITE_API_URL="https://$API_HOST" \
  --tag "$WEB_REPOSITORY:$TAG" --push ./web
```

Changing the API hostname means rebuilding and redeploying the web image.

## 3. Deploy the database, Redis, and API

Use two private environment files outside the checkout, with their paths in `POSTGRES_ENV_FILE` and `API_ENV_FILE`. The database file requires `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`. The API file requires all four keys.

| Key | Value |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL using `postgres` as the host. Percent-encode reserved characters in the credentials. |
| `JWT_SECRET` | Strong signing secret. Preserve the existing value during redeployments so issued tokens remain valid. |
| `CORS_ORIGIN` | The web app's origin, including scheme, such as `https://rollcall.example.com`. Omit paths and trailing slashes. Browsers can only call the API from this origin. |
| `WEB_URL` | The web app's public HTTPS URL. The current API reads it but does not use it yet, and the Deployment still requires the key to exist. |

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

The API pods run `prisma migrate deploy` at startup. Prisma takes a database lock while it migrates, so several pods starting together is safe. Confirm the tables exist after the first rollout.

```sh
kubectl -n exam-manager exec postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
```

If the database holds data from an older migration history, Prisma refuses to start. In staging, delete the database contents or the volume and redeploy. Never do this once real data exists.

For a local diagnostic, run `kubectl -n exam-manager port-forward svc/api 3000:3000` and repeat the two API checks in step 1 from another terminal. For a staging persistence test, connect with the following command and use a dedicated disposable table. Insert a row, recreate just the PostgreSQL pod, reconnect after rollout, and confirm the row is present. Keep the PVC intact. The default DigitalOcean reclaim policy deletes the volume when its PVC is deleted.

```sh
kubectl -n exam-manager exec -it postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

The initial claim is 10 GiB. Plan backups before storing real data.

Each API pod requests 200m CPU and 128 MiB, with a 512 MiB memory limit and no CPU limit. A CPU limit would throttle pods during a check-in spike, and the HPA measures CPU relative to the request.

### Expose the app over public HTTPS

HTTPS uses one Gateway (Cilium's Gateway API controller, already enabled on the cluster) and cert-manager with Let's Encrypt. The Gateway gets a single DigitalOcean load balancer, routes `uoft-rollcall.duckdns.org` to the `web` Service and `uoft-rollcall-api.duckdns.org` to the `api` Service, and cert-manager issues and renews the certificates. The manifests are in `k8s/gateway/`.

1. Install cert-manager and enable its Gateway API support. The `--enable-gateway-api` flag isn't in the release manifest, so add it to the controller.

   ```sh
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.3/cert-manager.yaml
   kubectl -n cert-manager patch deploy cert-manager --type=json \
     -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--enable-gateway-api"}]'
   kubectl -n cert-manager rollout status deploy/cert-manager deploy/cert-manager-webhook
   ```

2. Create the issuers, the Gateway and the routes. Edit the contact email in `k8s/gateway/issuers.yaml` first. The Gateway's `cert-manager.io/cluster-issuer` annotation selects the issuer. Start with `letsencrypt-staging` to avoid rate limits, then switch to `letsencrypt-prod`.

   ```sh
   kubectl apply -f k8s/gateway/issuers.yaml
   kubectl -n exam-manager apply -f k8s/gateway/gateway.yaml -f k8s/gateway/routes.yaml
   kubectl -n exam-manager get gateway rollcall   # ADDRESS is the load balancer IP
   ```

3. Point both DuckDNS names at that IP. Let's Encrypt validates over HTTP on port 80, so the records must resolve before certificates can be issued. Watch them with `kubectl -n exam-manager get certificate`.

4. When both certificates are `READY`, switch the annotation to `letsencrypt-prod`, delete the staging `web-tls` and `api-tls` Certificates and Secrets so they are reissued, then add the HTTP to HTTPS redirect.

   ```sh
   kubectl -n exam-manager apply -f k8s/gateway/redirect.yaml
   ```

5. Verify from outside the cluster.

   ```sh
   curl -fsS https://uoft-rollcall-api.duckdns.org/ready
   curl -fsSI https://uoft-rollcall.duckdns.org/
   ```

The Gateway terminates TLS and proxies WebSocket upgrades. The web client opens Socket.IO with `transports: ['websocket']`, so no sticky sessions are needed. Backend health is handled by each pod's readiness probe, which removes a pod that loses its database from the Service endpoints. cert-manager renews certificates automatically about 30 days before they expire. [cert-manager Gateway API](https://cert-manager.io/docs/usage/gateway/) · [ACME HTTP-01 with Gateway API](https://cert-manager.io/docs/configuration/acme/http01/#configuring-the-http-01-gateway-api-solver)

For a manual API-only update, set `API_IMAGE` to the new pushed digest and run `kubectl -n exam-manager set image deployment/api api="$API_IMAGE"`. Wait for rollout and verify `/ready` and the changed feature.

### Deploy the web app

Set `WEB_IMAGE` to the pushed web digest and make sure the API Secret's `WEB_URL` and `CORS_ORIGIN` use the public `https://` web address. After changing the Secret, restart the API with `kubectl -n exam-manager rollout restart deployment/api`. `k8s/web.yaml` creates the Deployment and the internal `web` Service that the Gateway routes to.

```sh
WEB_IMAGE="$WEB_REPOSITORY@sha256:REPLACE_WITH_WEB_DIGEST"
sed -e "s|WEB_IMAGE|$WEB_IMAGE|" \
    -e '/^      containers:/i\
      imagePullSecrets:\
        - name: '"$REGISTRY"'
' k8s/web.yaml | kubectl -n exam-manager apply -f -
kubectl -n exam-manager rollout status deployment/web --timeout=2m
```

Open `https://uoft-rollcall.duckdns.org`, sign up, and confirm the browser console shows no CORS errors. Two web pods use about 50m CPU and 64 MiB in total.

### Staging without a domain (plain HTTP)

Until you have a hostname, `k8s/plain/` exposes both Services over HTTP on port 80 with one load balancer each. Browsers block camera access on plain HTTP, so QR scanning won't work, but the typed-email and barcode check-in still do. Create both load balancers first to get their IPs, because each address is needed by the other component.

```sh
kubectl -n exam-manager apply -f k8s/plain/api-public.yaml -f k8s/plain/web-public.yaml
kubectl -n exam-manager get svc api-public web-public -w
```

With `API_IP` and `WEB_IP` from the `EXTERNAL-IP` column, build the web image with `--build-arg VITE_API_URL="http://$API_IP"`. Add `WEB_URL` and `CORS_ORIGIN` as `http://$WEB_IP` to the `api-credentials` Secret and roll out the API as above. Then deploy `k8s/web.yaml` as shown in the previous section.

The web app is then at `http://$WEB_IP`. The starter registry plan allows one repository, so the web image can't have its own repository. Push it as a tag of `exam-manager-api` (for example `web-<commit>`), or upgrade the registry to the Basic plan. Both load balancers are billed while they exist, so delete them with `kubectl -n exam-manager delete svc api-public web-public` when the demo is over.

## Continuous deployment

After the first manual deploy, `.github/workflows/deploy.yml` deploys every push to `main`:
1. It runs the API and UI tests.
2. It builds both images and pushes them to `exam-manager-api` as `api-<sha>` and `web-<sha>`.
3. It points the `api` and `web` Deployments at the new images by digest, then waits for the rollout.
4. It checks `/ready` and runs the read-only smoke tests against the live site. If any of this fails, it rolls both Deployments back.

You can also start it by hand: **Actions → Deploy → Run workflow**.

Setup, once:

- **Repository secret** `DIGITALOCEAN_ACCESS_TOKEN`: a DigitalOcean API token with read and write access, just for GitHub, so it can be revoked on its own.
- **Repository variables** `PUBLIC_WEB_URL` and `PUBLIC_API_URL`, optional. They default to the two load balancer IPs. Set them when the site moves to a domain; the next deploy rebuilds the web app against the new API address. Also update `WEB_URL` and `CORS_ORIGIN` in the `api-credentials` Secret to match.

Migrations run when the new API pods start. A rollback brings back the old image but doesn't undo migrations, so keep them backwards compatible: add columns and tables, and don't rename or drop in the same change.

Each API image is about 175 MB. Delete old tags now and then (`doctl registry repository list-tags exam-manager-api`, then `doctl registry repository delete-tag exam-manager-api <tag>`), and run garbage collection so the registry doesn't fill up.

## 4. Enable autoscaling and monitoring

The staging cluster already provides the metrics API. On a fresh cluster, install Metrics Server v0.9.1 if it is absent and wait for it to become available.

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

The HPA targets 70% of requested CPU and manages 2–6 replicas. It waits five minutes of low load before removing pods, so allow for that when capturing scale-down. Six API pods request 1.2 CPU in total. The two workers have about 3.8 CPU allocatable and roughly 1.7 already requested, so six replicas fit, but you should rerun `kubectl describe nodes` after adding workloads. Use the DigitalOcean Kubernetes Insights graphs for historical node CPU and memory. Use `kubectl top pods` for live pod metrics and inspect restart counts with `kubectl get pods`. The `api-health` CronJob checks the internal Service every minute. Inspect outcomes with `kubectl -n exam-manager get jobs` and `kubectl -n exam-manager logs job/<job-name>`.

### Configure DigitalOcean alerts

In Monitoring, create two resource alert policies scoped to the staging Kubernetes worker tag. Set CPU utilization above 80% for five minutes and memory utilization above 85% for five minutes. Set the notification destination to the team's email or Slack channel. [DigitalOcean resource alerts](https://docs.digitalocean.com/products/monitoring/how-to/manage-resource-alerts/)

In Uptime, create an HTTPS check for `https://$API_HOST/ready`. Add a downtime alert to the same destination and confirm the check reports healthy. Capture the enabled worker policies and the healthy uptime check with its alert settings for the report. [DigitalOcean Uptime alerts](https://docs.digitalocean.com/products/uptime/how-to/create-alerts/)

## 5. Exercise concurrent student check-ins

The workload calls `POST /exams/:examId/checkins` with `{"roomId":"...","studentId":"..."}`. A new check-in returns HTTP 201, and a repeat for the same student returns 200 without creating a second row. The script expects 201 for every request, so each run needs fresh students.

[`load-tests/seed.mjs`](../load-tests/seed.mjs) creates everything the test needs and writes the fixtures: a course, an offering, one large room, a roster of synthetic students (`loadtest-*@example.com`), an exam with generated seating, and one request body per student. It needs the token of an **approved instructor**. Register a throwaway account in the app, make it an admin and approved instructor from inside the API pod (the account must have registered first), and log in to get a token:

```sh
kubectl -n exam-manager exec deploy/api -- node dist/scripts/make-admin.js loadtest-admin@example.com
curl -fsS -X POST "https://$API_HOST/auth/login" -H 'content-type: application/json' \
  -d '{"email":"loadtest-admin@example.com","password":"<password>"}'   # copy the token
```

The script needs at least `rate × 240` unique bodies, so 10 check-ins per second needs 2,400 students and 50 per second needs 12,000. The seed script sizes the room for the student count, up to 200 rows of 100 seats. Keep fixtures and tokens outside Git.

```sh
API_URL="https://$API_HOST" TOKEN="$TOKEN" STUDENTS=2400 node load-tests/seed.mjs "$FIXTURES"
# prints EXAM_ID=...
```

Then run the test. Use the Docker image if k6 isn't installed locally.

```sh
BASE_URL="https://$API_HOST" CHECK_IN_PATH="/exams/$EXAM_ID/checkins" \
  TOKEN="$TOKEN" FIXTURES="$FIXTURES" CHECK_INS_PER_SECOND=10 \
  k6 run load-tests/check-in.js
```

```sh
docker run --rm -v "$PWD/load-tests:/s" -v "$(dirname "$FIXTURES"):/f" \
  -e BASE_URL="https://$API_HOST" -e CHECK_IN_PATH="/exams/$EXAM_ID/checkins" \
  -e TOKEN="$TOKEN" -e FIXTURES="/f/$(basename "$FIXTURES")" -e CHECK_INS_PER_SECOND=10 \
  grafana/k6:latest run /s/check-in.js
```

In a separate terminal, run `kubectl -n exam-manager get hpa api -w` from before the load starts until replicas return to baseline. Capture the k6 summary, replica counts, and timestamps for the report.

The script ramps for 30 seconds, holds for three minutes, and ramps down for 30 seconds. Use fresh fixtures for each run. The default thresholds are provisional course-demo targets. Review p95 latency, response failures and dropped iterations against CPU, memory, and HPA replica counts. Verify that checked-in rows match the successful requests.

```sh
kubectl -n exam-manager exec postgres-0 -- sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from \"CheckIn\""'
```

A local Compose run with 1,000 students at 4 per second (855 requests) passed all thresholds with p95 latency around 17 ms and 855 matching `CheckIn` rows. That run did not exercise autoscaling, multiple pods, or the load balancer. Repeat it on staging at a higher rate before drawing conclusions.

Delete the synthetic data afterwards. Removing the course cascades to its offering, members, exams, seat assignments and check-ins. The throwaway users and the room stay, so remove them too:

```sh
kubectl -n exam-manager exec postgres-0 -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "delete from \"Course\" where code like '"'"'LOAD%'"'"'; delete from \"Room\" where name like '"'"'Load test %'"'"'; delete from \"User\" where email like '"'"'loadtest-%@example.com'"'"'"'
```

### Verify live updates between pods

The proctor page connects with a login token (`auth: { token }`), joins an exam with `exam:join` and `{ examId }`, then listens for `checkin:created`. Only the exam's staff can join. Use `transports: ['websocket']`, as the web client does.

Choose two ready API pods with `kubectl -n exam-manager get pods -l app=api`. Port-forward directly to each pod on a different local port. Connect a Socket.IO client to pod B with a staff token and join the exam, then submit a check-in through pod A. Verify the POST returns 201 and the socket on pod B receives `checkin:created` for that student. If it does not, check that the API log shows `Socket.IO using Redis adapter` and that the `redis` pod is ready. Capture both pod names and the matching event for the report.

## References

- [DigitalOcean Kubernetes volumes](https://docs.digitalocean.com/products/kubernetes/how-to/add-volumes/)
- [DigitalOcean Kubernetes autoscaling](https://docs.digitalocean.com/products/kubernetes/how-to/set-up-autoscaling/)
- [DigitalOcean Kubernetes monitoring](https://docs.digitalocean.com/products/kubernetes/how-to/monitoring/)
- [k6 ramping arrival rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
