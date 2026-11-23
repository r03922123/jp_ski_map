#!/usr/bin/env bash
# Daily production probe (SPEC-deploy.md, "Daily production probe"). Times the first and a second
# /api/health and /api/route, and fails when a request errors or the cold start takes over LIMIT_S.
# The routing engine loads on the first route, so health-cold is the boot and route-first adds Valhalla.
set -euo pipefail
: "${PROD_URL:?set PROD_URL to the production origin}"
LIMIT_S="${LIMIT_S:-5}"
# A Hakuba hotel to Happo-One's Adam Gondola, the README's example start
ROUTE="/api/route?mode=drive&from=36.69711,137.85393&to=36.70179,137.83683"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
fail=0
t=0

over() { awk -v t="$1" -v l="$LIMIT_S" 'BEGIN { exit !(t > l) }'; }

probe() { # label path; sets t to the seconds taken
  local out code verdict=ok
  out=$(curl -sS -o /dev/null --max-time 30 -w '%{http_code} %{time_total}' "${PROD_URL%/}$2") || true
  read -r code t <<<"${out:-000 30}"
  if [[ $code != 200 ]] || over "$t"; then verdict=FAIL; fail=1; fi
  printf '| %s | %s | %s | %s |\n' "$1" "$code" "$t" "$verdict" | tee -a "$summary"
}

printf '| Request | HTTP | Seconds | Verdict (limit %s s) |\n|---|---|---|---|\n' "$LIMIT_S" | tee -a "$summary"
probe "health, first (cold boot if the instance was idle)" /api/health
boot=$t
probe "route, first (loads Valhalla on a new instance)" "$ROUTE"
cold=$(awk -v a="$boot" -v b="$t" 'BEGIN { printf "%.3f", a + b }')
probe "health, warm" /api/health
probe "route, warm" "$ROUTE"
verdict=ok
if over "$cold"; then verdict=FAIL; fail=1; fi
printf '| cold start = health first + route first | | %s | %s |\n' "$cold" "$verdict" | tee -a "$summary"
exit "$fail"
