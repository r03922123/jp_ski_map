#!/usr/bin/env bash
# Point the production domain at a staged deployment, after the smoke suite passed (SPEC-deploy Phase C).
#
#   scripts/promote-vercel.sh <staged deployment URL> <production domain>
#
# Promotes only while HEAD is still main's tip on origin: a job that reached the deploy late, or a
# rerun of an old one, must not put older code live over a newer push.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)

die() {
  echo "promote-vercel: $*" >&2
  exit 1
}

[[ $# -eq 2 ]] || die "usage: scripts/promote-vercel.sh <staged deployment URL> <production domain>"
url=$1
domain=$2

head=$(git -C "$ROOT" rev-parse HEAD)
tip=$(git -C "$ROOT" ls-remote origin refs/heads/main | cut -f1)
[[ -n $tip ]] || die "could not read main's tip from origin"
if [[ $head != "$tip" ]]; then
  echo "::notice::not promoting $head: main is now at $tip, whose own run deploys it if green"
  exit 0
fi

vercel promote "$url" --yes

id_of() { vercel inspect "$1" --json | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])'; }
want=$(id_of "$url")
# Vercel moves domains in a background job, so the domain can lag the promote by a few seconds.
for try in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if [[ $(id_of "$domain") == "$want" ]]; then
    echo "promote-vercel: $domain now serves $url ($want)"
    exit 0
  fi
  [[ $try -eq 12 ]] || sleep "${PROMOTE_POLL_S:-5}"
done
die "$domain still doesn't serve $url ($want) after 12 checks"
