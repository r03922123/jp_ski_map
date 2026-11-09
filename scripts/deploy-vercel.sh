#!/usr/bin/env bash
# Deploy the committed code to Vercel (SPEC-deploy Phase B, Changes item 8). The only way to deploy.
#
#   scripts/deploy-vercel.sh          protected preview
#   scripts/deploy-vercel.sh --prod   production: ask the owner first
#
# Uploads a temp folder built from `git archive HEAD`, so uncommitted files (.env, .ux-evidence,
# .run) can't leave this machine. Every check runs before the single `vercel` call.
# Run it from the checkout that holds the Vercel link and the built tiles; both are gitignored.
#
# In the upload, under services/api/: runtime data in data/, tiles in tiles/valhalla_tiles.tar.
# HAKUBA_DATA_DIR and VALHALLA_TILES must point there (Changes item 9).
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

# Bind the folder to the linked project: an unlinked folder is how Probe P created a new project.
LINK="$ROOT/.vercel/project.json"
if [[ -n ${VERCEL_ORG_ID:-} && -n ${VERCEL_PROJECT_ID:-} ]]; then
  : # the CLI reads these two directly
elif [[ -n ${VERCEL_ORG_ID:-}${VERCEL_PROJECT_ID:-} ]]; then
  die "project link incomplete: set both VERCEL_ORG_ID and VERCEL_PROJECT_ID"
elif [[ -f $LINK ]] &&
  grep -Eq '"projectId"[[:space:]]*:[[:space:]]*"[^"]+"' "$LINK" &&
  grep -Eq '"orgId"[[:space:]]*:[[:space:]]*"[^"]+"' "$LINK"; then
  mkdir "$STAGE/.vercel"
  cp "$LINK" "$STAGE/.vercel/project.json"
else
  die "project link missing: run 'vercel link' in this checkout first (the owner does this)"
fi

API="$STAGE/services/api"
mkdir -p "$API/data/bus" "$API/tiles"

# Only what the API reads at runtime; data/bus/raw and stop_evidence.json stay out of the upload.
for item in resorts.json bus_stops.json bus/timetables bus/sources.json lodging_osm.json \
  lodging_overture.json poi_osm.json crowd_periods.json; do
  [[ -s $STAGE/data/$item ]] || die "runtime data missing or empty in this commit: data/$item"
  cp -R "$STAGE/data/$item" "$API/data/$item"
done
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

echo "deploy-vercel: deploying commit $(git -C "$ROOT" rev-parse HEAD) with: ${TARGET[*]}"
# No --yes and no stdin: the CLI gets nobody to answer "create a new project?".
cd "$STAGE"
vercel deploy "${TARGET[@]}" </dev/null
