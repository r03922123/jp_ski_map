#!/usr/bin/env bash
# Daily production probe (SPEC-deploy.md, "Daily production probe"). Times the first and a second
# /api/health and /api/route, and fails when a request errors, the cold start takes over LIMIT_S,
# or a warm request over WARM_LIMIT_S.
# The routing engine loads on the first route, so health-first is the boot and route-first adds Valhalla.
set -euo pipefail
: "${PROD_URL:?set PROD_URL to the production origin}"
LIMIT_S="${LIMIT_S:-5}"
# Above SPEC-deploy's 500 ms: GitHub's runners are far from the hnd1 function
WARM_LIMIT_S="${WARM_LIMIT_S:-1}"
# A Hakuba hotel to Happo-One's Adam Gondola, the README's example start
ROUTE="/api/route?mode=drive&from=36.69711,137.85393&to=36.70179,137.83683"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
fail=0
t=0

over() { awk -v t="$1" -v l="$2" 'BEGIN { exit !(t > l) }'; }

row() { # label code seconds limit
  local verdict=ok
  if [[ $2 != 200 && $2 != - ]] || over "$3" "$4"; then verdict=FAIL; fail=1; fi
  printf '| %s | %s | %.3f | %s | %s |\n' "$1" "$2" "$3" "$4" "$verdict" | tee -a "$summary"
}

probe() { # label path limit; sets t to the seconds taken
  local out code
  out=$(curl -sS -o /dev/null --max-time 30 -w '%{http_code} %{time_total}' "${PROD_URL%/}$2") || true
  read -r code t <<<"${out:-000 30}"
  row "$1" "$code" "$t" "$3"
}

printf '| Request | HTTP | Seconds | Limit | Verdict |\n|---|---|---|---|---|\n' | tee -a "$summary"
probe "health, first (cold boot if the instance was idle)" /api/health "$LIMIT_S"
boot=$t
probe "route, first (loads Valhalla on a new instance)" "$ROUTE" "$LIMIT_S"
first_route=$t
probe "health, warm" /api/health "$WARM_LIMIT_S"
# Two requests, one round trip too many: subtract a warm health, so this compares with the
# Checkpoint S number (one first /api/route on a new instance)
cold=$(awk -v a="$boot" -v b="$first_route" -v w="$t" 'BEGIN { print a + b - w }')
probe "route, warm" "$ROUTE" "$WARM_LIMIT_S"
row "cold start = health first + route first - health warm" - "$cold" "$LIMIT_S"
exit "$fail"
