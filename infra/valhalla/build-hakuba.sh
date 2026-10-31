#!/usr/bin/env bash
# Build Valhalla routing tiles for the Hakuba valley only (SPEC-deploy v1.5).
#
# Geofabrik chubu (~500 MB) → osmium bbox crop (~3.5 MB) → custom_files/hakuba/,
# which valhalla-scripted turns into tiles (~4 MB, ~40 MB RAM) on its next start.
# The bbox lives in hakuba.bbox; tests/routing/test_coverage.py checks it covers data/.
set -euo pipefail
cd "$(dirname "$0")"

PBF_URL=https://download.geofabrik.de/asia/japan/chubu-latest.osm.pbf
SRC=custom_files/chubu-latest.osm.pbf
OUT=custom_files/hakuba
BBOX=$(tr -d '[:space:]' < hakuba.bbox)

mkdir -p custom_files "$OUT"
if [[ ! -f $SRC || ${1:-} == --refresh ]]; then
  echo "downloading $PBF_URL"
  curl -fL --retry 3 -o "$SRC.part" "$PBF_URL" && mv "$SRC.part" "$SRC"
fi

echo "cropping to $BBOX"
docker run --rm -v "$PWD/custom_files":/data debian:stable-slim sh -c "
  apt-get update -qq >/dev/null && apt-get install -y -qq osmium-tool >/dev/null &&
  osmium extract --bbox $BBOX --strategy smart --overwrite \
    /data/chubu-latest.osm.pbf -o /data/hakuba/hakuba.osm.pbf"

# drop old tiles so valhalla-scripted rebuilds from the new crop
rm -rf "$OUT/valhalla_tiles" "$OUT/valhalla_tiles.tar" "$OUT/file_hashes.txt"
docker compose -f ../docker-compose.yml up -d --force-recreate valhalla
echo "building tiles; follow with: docker compose -f infra/docker-compose.yml logs -f valhalla"
