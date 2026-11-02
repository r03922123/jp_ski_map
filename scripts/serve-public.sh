#!/usr/bin/env bash
# Serve the production build from this Mac, optionally public via Tailscale Funnel (SPEC-deploy v1.5).
#
#   scripts/serve-public.sh            build + start Valhalla, API (:8011), web (:3000); health check
#   scripts/serve-public.sh --funnel   ... then publish :3000 at https://<machine>.<tailnet>.ts.net
#   scripts/serve-public.sh --stop     Funnel off first, then stop the API and web
#
# Own ports (8011/3000) so the dev servers (8010, 3443) keep running beside it.
# Logs and PIDs: .run/ (gitignored). Funnel is only turned on after the health check passes.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
RUN="$ROOT/.run"
API_PORT=8011
WEB_PORT=3000
mkdir -p "$RUN"

stop_pid() {
  local f="$RUN/$1.pid"
  if [[ -f $f ]] && kill -0 "$(cat "$f")" 2>/dev/null; then
    kill "$(cat "$f")" && echo "stopped $1"
  fi
  rm -f "$f"
}

if [[ ${1:-} == --stop ]]; then
  # take the site offline before anything else
  if command -v tailscale >/dev/null; then tailscale funnel --https=443 off || true; fi
  stop_pid web
  stop_pid api
  exit 0
fi

FUNNEL=false
[[ ${1:-} == --funnel ]] && FUNNEL=true
if $FUNNEL && ! command -v tailscale >/dev/null; then
  echo "tailscale CLI not found: install Tailscale first (SPEC-deploy, Checkpoint M)" >&2
  exit 1
fi

PUBLIC_URL="http://127.0.0.1:$WEB_PORT"
HOPS=""
if $FUNNEL; then
  host=$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')
  PUBLIC_URL="https://$host"
  HOPS=1 # Funnel appends the visitor's address to X-Forwarded-For
fi

start_bg() { # name, dir, command...: the PID file holds the server itself (exec), not a wrapper
  local name=$1 dir=$2
  shift 2
  (cd "$dir" && exec "$@") >"$RUN/$name.log" 2>&1 </dev/null &
  echo $! >"$RUN/$name.pid"
}

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do curl -sf -o /dev/null "$1" && return 0; sleep 1; done
  echo "not healthy after $2 s: $1" >&2
  return 1
}

echo "valhalla (Hakuba tiles)"
docker compose -f "$ROOT/infra/docker-compose.yml" up -d valhalla >/dev/null
wait_for http://127.0.0.1:8002/status 120

echo "api on :$API_PORT ($PUBLIC_URL)"
stop_pid api
start_bg api "$ROOT/services/api" env PUBLIC_URL="$PUBLIC_URL" TRUSTED_PROXY_HOPS="$HOPS" \
  .venv/bin/uvicorn hakuba_api.main:app --host 127.0.0.1 --port $API_PORT \
  --proxy-headers --forwarded-allow-ips 127.0.0.1 # access log: the visitor, not the web server
wait_for "http://127.0.0.1:$API_PORT/api/health" 30

echo "web: production build"
stop_pid web
# the /api rewrite target is fixed at build time
(cd "$ROOT/apps/web" && API_URL="http://127.0.0.1:$API_PORT" pnpm build >"$RUN/build.log" 2>&1) ||
  { echo "build failed: see $RUN/build.log" >&2; exit 1; }
start_bg web "$ROOT/apps/web" ./node_modules/.bin/next start -H 127.0.0.1 -p $WEB_PORT
# through the rewrite: checks web → api in one request
wait_for "http://127.0.0.1:$WEB_PORT/api/health" 60
echo "healthy: http://127.0.0.1:$WEB_PORT"

if $FUNNEL; then
  tailscale funnel --bg $WEB_PORT
  echo "PUBLIC: $PUBLIC_URL  (take it down: scripts/serve-public.sh --stop)"
fi
