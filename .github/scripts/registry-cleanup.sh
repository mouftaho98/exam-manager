#!/usr/bin/env bash
# Keeps the DigitalOcean container registry under its free-plan limit
# (Basic plan: 5 GB; the old free plan was ~524 MB; each API image is ~175 MB) without making deploys wait.
#
#   registry-cleanup.sh prepare   before pushing: make sure the new images fit
#   registry-cleanup.sh tidy      after a successful deploy: free space for the next one
#
# Space is only freed by garbage collection (GC), which can take 10-20+
# minutes and makes the registry read-only while it runs. So the normal path
# is: `tidy` deletes the tags the cluster no longer runs and *starts* GC
# without waiting; it finishes in the gap before the next deploy. `prepare`
# only waits for a GC still running, and cleans up itself only if there isn't
# room (e.g. after a manual deploy from another branch).
#
# Needs: doctl (logged in), kubectl (pointed at the cluster), jq.
# Env: REPOSITORY (registry.digitalocean.com/<registry>/<repo>), NAMESPACE.
# Optional: QUOTA_MB (5000), NEED_MB (room a deploy needs, 230),
#           GC_WAIT_MINUTES (30), DRY_RUN=1 (print, change nothing),
#           PREPARE_LIMIT_PCT (80: clean before a push only past this % of the
#           quota), TIDY_ABOVE_PCT (40: start GC after a deploy only past this %).
set -euo pipefail

MODE="${1:?usage: registry-cleanup.sh prepare|tidy}"
REGISTRY_NAME="${REPOSITORY#registry.digitalocean.com/}"; REGISTRY_NAME="${REGISTRY_NAME%%/*}"
REPO_NAME="${REPOSITORY##*/}"
QUOTA_MB="${QUOTA_MB:-5000}"
NEED_MB="${NEED_MB:-230}"
GC_WAIT_MINUTES="${GC_WAIT_MINUTES:-30}"
PREPARE_LIMIT_PCT="${PREPARE_LIMIT_PCT:-80}"
TIDY_ABOVE_PCT="${TIDY_ABOVE_PCT:-40}"

run() { if [ -n "${DRY_RUN:-}" ]; then echo "[dry run] $*"; else "$@"; fi; }

# Status of the running GC, or empty if none. JSON, because get-active ignores
# --format; with none running it returns an error object (no status).
gc_status() {
  doctl registry garbage-collection get-active "$REGISTRY_NAME" -o json 2>/dev/null |
    jq -r '(if type == "array" then .[0] else . end) | .status // empty' || true
}

wait_for_gc() {
  local deadline=$((SECONDS + GC_WAIT_MINUTES * 60)) status
  while :; do
    status=$(gc_status)
    case "$status" in ""|succeeded|failed|cancelled) return 0 ;; esac
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::Registry garbage collection still running after ${GC_WAIT_MINUTES} min ($status). Re-run this job later."
      return 1
    fi
    echo "waiting for registry garbage collection: $status"
    sleep 15
  done
}

used_mb() { doctl registry get "$REGISTRY_NAME" -o json | jq -r '(if type == "array" then .[0] else . end) | (.storage_usage_bytes // 0) / 1e6 | floor'; }

# Image digests the api and web Deployments run right now.
live_digests() {
  kubectl -n "$NAMESPACE" get deployment api web \
    -o jsonpath='{range .items[*]}{.spec.template.spec.containers[0].image}{"\n"}{end}' | sed -n 's/.*@//p'
}

# Delete every tag that isn't live. Prints how many were deleted.
delete_old_tags() {
  local live deleted=0 tag digest
  live=$(live_digests)
  while read -r tag digest; do
    [ -z "$tag" ] && continue
    if grep -qx "$digest" <<<"$live"; then
      echo "keep   $tag (running)" >&2
    else
      echo "delete $tag" >&2
      run doctl registry repository delete-tag "$REPO_NAME" "$tag" --force >&2
      deleted=$((deleted + 1))
    fi
  done < <(doctl registry repository list-tags "$REPO_NAME" -o json | jq -r '.[] | "\(.tag) \(.manifest_digest)"')
  echo "$deleted"
}

start_gc() { run doctl registry garbage-collection start "$REGISTRY_NAME" --include-untagged-manifests --force; }

case "$MODE" in
  prepare)
    # A GC started by the last deploy may still be running (registry is read-only).
    wait_for_gc
    used=$(used_mb)
    echo "registry usage: ${used} MB of ${QUOTA_MB} MB; a deploy needs ~${NEED_MB} MB"
    if [ $((used + NEED_MB)) -le $((QUOTA_MB * PREPARE_LIMIT_PCT / 100)) ]; then
      echo "enough room"
      exit 0
    fi
    echo "not enough room: removing images the cluster doesn't run and collecting now"
    delete_old_tags >/dev/null
    # Untagged leftovers (e.g. overwritten tags) count too, so collect even if
    # no tag was deleted.
    start_gc
    [ -n "${DRY_RUN:-}" ] || { sleep 5; wait_for_gc; }
    echo "registry usage after cleanup: $(used_mb) MB"
    ;;
  tidy)
    # The new version is live and healthy; the previous one is no longer needed.
    if [ -n "$(gc_status)" ]; then
      echo "a garbage collection is already running; leaving it"
      exit 0
    fi
    deleted=$(delete_old_tags)
    used=$(used_mb)
    # Collecting briefly makes the registry read-only, so only do it once the
    # registry is getting full, not after every deploy.
    if [ "$used" -ge $((QUOTA_MB * TIDY_ABOVE_PCT / 100)) ]; then
      start_gc
      echo "deleted ${deleted} old tag(s); ${used} MB used, garbage collection started (finishes in the background)"
    else
      echo "deleted ${deleted} old tag(s); ${used} MB used, under ${TIDY_ABOVE_PCT}% of ${QUOTA_MB} MB so no garbage collection yet"
    fi
    ;;
  *)
    echo "usage: registry-cleanup.sh prepare|tidy" >&2
    exit 2
    ;;
esac
