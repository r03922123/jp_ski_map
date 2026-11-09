#!/usr/bin/env bash
# Deploy the committed code to Vercel (SPEC-deploy Phase B, Changes item 8). The only way to deploy.
#
#   scripts/deploy-vercel.sh          preview
#   scripts/deploy-vercel.sh --prod   production: ask the owner first
#
# Uploads a temp folder built from `git archive HEAD`, so uncommitted files (.env, .ux-evidence,
# .run) can't leave this machine. Every check runs before the first `vercel` call.
# Run it from the checkout that holds the Vercel link and the built tiles; both are gitignored.
#
# In the upload, under services/api/: runtime data in data/, tiles in tiles/valhalla_tiles.tar.
# HAKUBA_DATA_DIR and VALHALLA_TILES must point there (Changes item 9). Whether the function can
# read files placed there under `services` is unverified until Checkpoint S.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)

die() {
  echo "deploy-vercel: $*" >&2
  exit 1
}

if [[ $# -eq 0 ]]; then
  # Stated outright: with no flag, a new project's first deploy went to production at Probe P.
  TARGET=(--environment preview)
elif [[ $# -eq 1 && $1 == --prod ]]; then
  TARGET=(--prod)
else
  die "usage: scripts/deploy-vercel.sh [--prod]"
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
git -C "$ROOT" archive HEAD | tar -x -C "$STAGE"

# Bind the upload through these two variables, not a copied link file. With a dead link file the
# CLI goes on to create a project, and auto-confirms that when an agent runs it without a terminal.
# With the variables it stops at "Project not found" (vercel/vercel, util/projects/link.ts).
LINK="$ROOT/.vercel/project.json"
link_id() { sed -nE "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\1/p" "$LINK"; }
if [[ -n ${VERCEL_ORG_ID:-}${VERCEL_PROJECT_ID:-} ]]; then
  [[ -n ${VERCEL_ORG_ID:-} && -n ${VERCEL_PROJECT_ID:-} ]] ||
    die "project link incomplete: set both VERCEL_ORG_ID and VERCEL_PROJECT_ID"
else
  [[ -f $LINK ]] || die "project link missing: run 'vercel link' in this checkout first (the owner does this)"
  VERCEL_ORG_ID=$(link_id orgId)
  VERCEL_PROJECT_ID=$(link_id projectId)
  [[ -n $VERCEL_ORG_ID && -n $VERCEL_PROJECT_ID ]] || die "project link missing orgId or projectId: $LINK"
fi
export VERCEL_ORG_ID VERCEL_PROJECT_ID

API="$STAGE/services/api"
mkdir -p "$API/data/bus" "$API/tiles"

# Only what the API reads at runtime; data/bus/raw and stop_evidence.json stay out of the upload.
for item in resorts.json bus_stops.json bus/timetables bus/sources.json lodging_osm.json \
  lodging_overture.json poi_osm.json crowd_periods.json; do
  [[ -s $STAGE/data/$item ]] || die "runtime data missing or empty in this commit: data/$item"
  cp -R "$STAGE/data/$item" "$API/data/$item"
done
# bus/store.py reads timetables/<season>/*.json, so a folder without those means no buses at all.
[[ -n $(find "$API/data/bus/timetables" -mindepth 2 -maxdepth 2 -name '*.json') ]] ||
  die "no timetables in this commit: data/bus/timetables/<season>/*.json"
rm -rf "$STAGE/data"

# Nothing else guards this: a truncated tar passes the build and segfaults on the first route.
# The copy is what gets hashed, so the bytes checked are the bytes uploaded.
TILES="$ROOT/infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
HASH_FILE="$STAGE/infra/valhalla/hakuba-tiles.sha256"
[[ -f $TILES ]] || die "tiles missing: $TILES"
[[ -f $HASH_FILE ]] || die "tile hash missing in this commit: infra/valhalla/hakuba-tiles.sha256"
cp "$TILES" "$API/tiles/valhalla_tiles.tar"
expected=$(cut -d' ' -f1 "$HASH_FILE")
actual=$(shasum -a 256 "$API/tiles/valhalla_tiles.tar" | cut -d' ' -f1)
[[ -n $expected && $actual == "$expected" ]] || die "tile hash mismatch: got $actual, want $expected"

cd "$STAGE"
echo "deploy-vercel: deploying commit $(git -C "$ROOT" rev-parse HEAD) with: ${TARGET[*]}"
echo "deploy-vercel: vercel CLI $(vercel --version 2>/dev/null)"
vercel deploy "${TARGET[@]}"
