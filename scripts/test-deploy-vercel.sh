#!/usr/bin/env bash
# Tests scripts/deploy-vercel.sh and scripts/promote-vercel.sh in a throwaway git repo against a stub
# `vercel` (SPEC-deploy, Testing).
# PATH holds only the stub folder and the system folders, with the stub first, so nothing can deploy.
set -euo pipefail
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE VERCEL_ORG_ID VERCEL_PROJECT_ID VERCEL_TOKEN
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
export PATH="$WORK/bin:/usr/bin:/bin"
# The script falls back to ~/.npm/_npx, so HOME is a throwaway too: the real npx copy can't be reached.
export HOME="$WORK/home"
mkdir "$HOME"
export VERCEL_STUB_LOG="$WORK/vercel.log"
REPO="$WORK/repo"
OUT="$WORK/out"
FAILED=0

mkdir "$WORK/bin"
cat >"$WORK/bin/vercel" <<'STUB'
#!/bin/sh
# Test double: records the arguments, the project link, the folder and the files it would upload.
if [ "$1" = --version ]; then
  echo 0.0.0-stub
  exit 0
fi
# inspect isn't recorded: the staged build is dpl_staged, and STUB_DOMAIN serves STUB_DOMAIN_ID.
if [ "$1" = inspect ]; then
  if [ "$2" = "${STUB_DOMAIN:-}" ]; then echo "{\"id\":\"$STUB_DOMAIN_ID\"}"; else echo '{"id":"dpl_staged"}'; fi
  exit 0
fi
printf '%s\n' "$*" >>"$VERCEL_STUB_LOG"
printf '%s %s\n' "$VERCEL_ORG_ID" "$VERCEL_PROJECT_ID" >"$VERCEL_STUB_LOG.link"
pwd >"$VERCEL_STUB_LOG.cwd"
find . -type f | sort >"$VERCEL_STUB_LOG.files"
staged='{"deployment":{"url":"jp-ski-abc.vercel.app"}}'
case " $* " in *" --json "*) printf '%s\n' "${VERCEL_STUB_JSON:-$staged}" ;; esac
exit "${VERCEL_STUB_EXIT:-0}"
STUB
chmod +x "$WORK/bin/vercel"
if [[ $(command -v vercel) != "$WORK/bin/vercel" ]]; then
  echo "refusing to run: the stub is not the vercel on PATH" >&2
  exit 2
fi

fail() {
  echo "  FAIL: $*"
  FAILED=1
}

git_q() { git -C "$REPO" -c user.name=test -c user.email=test@example.invalid -c commit.gpgsign=false "$@"; }

new_repo() {
  rm -rf "$REPO"
  mkdir -p "$REPO/scripts" "$REPO/data/bus/timetables/2025-26" "$REPO/data/bus/raw" \
    "$REPO/infra/valhalla/custom_files/hakuba" "$REPO/.vercel" "$REPO/services/api" "$REPO/.ux-evidence" "$REPO/.run"
  cp "$HERE/deploy-vercel.sh" "$HERE/promote-vercel.sh" "$REPO/scripts/"
  for f in resorts.json bus_stops.json bus/sources.json lodging_osm.json lodging_overture.json \
    lodging_readings.json lodging_aliases.json crowd_periods.json ski_lines.json bus/stop_evidence.json \
    bus/timetables/2025-26/line-a.json; do
    echo '[]' >"$REPO/data/$f"
  done
  echo 'pyproject' >"$REPO/services/api/pyproject.toml"
  printf '.vercel/\n.env\n.run/\n.ux-evidence/\ndata/bus/raw/\ninfra/valhalla/custom_files/\n' >"$REPO/.gitignore"
  echo 'tiles' >"$REPO/infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
  (cd "$REPO/infra/valhalla/custom_files/hakuba" && shasum -a 256 valhalla_tiles.tar) >"$REPO/infra/valhalla/hakuba-tiles.sha256"
  echo '{"projectId":"prj_test","orgId":"team_test"}' >"$REPO/.vercel/project.json"
  echo 'SECRET=1' >"$REPO/.env"
  echo 'x' | tee "$REPO/.ux-evidence/shot" "$REPO/.run/api.pid" "$REPO/data/bus/raw/page.html" >/dev/null
  git_q init -q
  git_q add -A
  git_q commit -qm fixture
}

commit_all() {
  git_q add -A
  git_q commit -qm change
}

deploy() {
  rm -f "$VERCEL_STUB_LOG" "$VERCEL_STUB_LOG".*
  STATUS=0
  "$REPO/scripts/deploy-vercel.sh" "$@" >"$OUT" 2>&1 || STATUS=$?
}

# Stopped, with the expected reason (so an unrelated failure can't pass), and vercel never ran.
expect_stop() {
  local name=$1 reason=$2
  echo "stops: $name"
  [[ $STATUS -ne 0 ]] || fail "exit status was 0"
  [[ ! -e $VERCEL_STUB_LOG ]] || fail "vercel was called: $(cat "$VERCEL_STUB_LOG")"
  grep -q "$reason" "$OUT" || fail "expected '$reason' in: $(cat "$OUT")"
}

expect_args() {
  [[ $STATUS -eq 0 ]] || fail "exit status $STATUS: $(cat "$OUT")"
  [[ -f $VERCEL_STUB_LOG && $(cat "$VERCEL_STUB_LOG") == "$1" ]] || fail "vercel args: want '$1'"
}

uploaded() { grep -qx "./$1" "$VERCEL_STUB_LOG.files"; }

promote() {
  rm -f "$VERCEL_STUB_LOG" "$VERCEL_STUB_LOG".*
  STATUS=0
  PROMOTE_POLL_S=0 "$REPO/scripts/promote-vercel.sh" "$@" >"$OUT" 2>&1 || STATUS=$?
}

# A bare repo as origin whose main is the fixture commit.
with_origin() {
  rm -rf "$WORK/origin.git"
  git init -q --bare "$WORK/origin.git"
  git_q remote add origin "$WORK/origin.git"
  git_q push -q origin HEAD:main
}

echo "preview by default, from committed files only"
new_repo
deploy
expect_args "deploy --environment preview"
grep -q "$(git_q rev-parse HEAD)" "$OUT" || fail "commit not printed"
for f in resorts.json bus_stops.json bus/sources.json lodging_osm.json lodging_overture.json \
  lodging_readings.json lodging_aliases.json crowd_periods.json ski_lines.json \
  bus/timetables/2025-26/line-a.json; do
  uploaded "services/api/data/$f" || fail "not uploaded: services/api/data/$f"
done
uploaded services/api/tiles/valhalla_tiles.tar || fail "tiles not uploaded"
[[ $(cat "$VERCEL_STUB_LOG.link") == "team_test prj_test" ]] || fail "link file IDs not passed to vercel"
if uploaded .vercel/project.json; then fail "link file in the upload"; fi
for f in .env .ux-evidence/shot .run/api.pid; do
  if uploaded "$f"; then fail "uploaded: $f"; fi
done
if grep -Eq 'stop_evidence|/raw/|custom_files|^\./data/' "$VERCEL_STUB_LOG.files"; then fail "non-runtime data uploaded"; fi
[[ ! -e $(cat "$VERCEL_STUB_LOG.cwd") ]] || fail "temp folder left behind"

echo "production only with --prod"
deploy --prod
expect_args "deploy --prod"

echo "env-var project link needs no link file"
new_repo
rm -rf "$REPO/.vercel"
VERCEL_ORG_ID=team_env VERCEL_PROJECT_ID=prj_env deploy
expect_args "deploy --environment preview"
[[ $(cat "$VERCEL_STUB_LOG.link") == "team_env prj_env" ]] || fail "env IDs not passed to vercel"

echo "a failing vercel fails the script"
new_repo
VERCEL_STUB_EXIT=7 deploy
[[ $STATUS -eq 7 ]] || fail "status $STATUS, want 7"

new_repo
deploy --production
expect_stop "unknown flag" "usage:"
deploy --prod extra
expect_stop "extra argument" "usage:"

for item in resorts.json bus_stops.json bus/timetables bus/sources.json lodging_osm.json \
  lodging_overture.json lodging_readings.json lodging_aliases.json crowd_periods.json ski_lines.json; do
  new_repo
  rm -rf "${REPO:?}/data/$item"
  commit_all
  deploy
  expect_stop "missing data/$item" "data/$item"
done

new_repo
rm -rf "$REPO/data/bus/timetables/2025-26"
echo 'notes' >"$REPO/data/bus/timetables/README.md"
echo '[]' >"$REPO/data/bus/timetables/too-shallow.json"
commit_all
deploy
expect_stop "timetables folder without <season>/*.json" "no timetables"

new_repo
: >"$REPO/data/resorts.json"
commit_all
deploy
expect_stop "empty data file" "data/resorts.json"

echo "the commit decides, not the working tree"
new_repo
rm "$REPO/data/resorts.json"
deploy
expect_args "deploy --environment preview"

echo "the committed hash decides, not an uncommitted edit"
new_repo
echo 'edited' >"$REPO/infra/valhalla/hakuba-tiles.sha256"
deploy
expect_args "deploy --environment preview"

new_repo
rm "$REPO/infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
deploy
expect_stop "missing tile file" "tiles missing"

new_repo
echo 'different' >"$REPO/infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
deploy
expect_stop "wrong tile hash" "tile hash mismatch"

new_repo
rm "$REPO/infra/valhalla/hakuba-tiles.sha256"
commit_all
deploy
expect_stop "hash file not committed" "tile hash missing"

new_repo
: >"$REPO/infra/valhalla/hakuba-tiles.sha256"
commit_all
deploy
expect_stop "empty hash file" "tile hash mismatch"

new_repo
rm -rf "$REPO/.vercel"
deploy
expect_stop "missing project link" "project link missing"

new_repo
echo '{"orgId":"team_test"}' >"$REPO/.vercel/project.json"
deploy
expect_stop "link file without projectId" "project link missing"

new_repo
echo '{"projectId":"prj_test"}' >"$REPO/.vercel/project.json"
deploy
expect_stop "link file without orgId" "project link missing"

new_repo
echo '{"projectId":"","orgId":"team_test"}' >"$REPO/.vercel/project.json"
deploy
expect_stop "link file with an empty projectId" "project link missing"

new_repo
VERCEL_ORG_ID=team_test deploy
expect_stop "only VERCEL_ORG_ID set" "project link incomplete"
VERCEL_PROJECT_ID=prj_test deploy
expect_stop "only VERCEL_PROJECT_ID set" "project link incomplete"

echo "--staged stages a production build and prints its URL last"
new_repo
deploy --staged
expect_args "deploy --prod --skip-domain --json"
# CI reads stdout only, so check stdout on its own
staged_url=$("$REPO/scripts/deploy-vercel.sh" --staged 2>/dev/null | tail -n 1)
[[ $staged_url == https://jp-ski-abc.vercel.app ]] || fail "last stdout line: $staged_url"

new_repo
VERCEL_STUB_JSON='{"error":{"name":"BUILD_ERROR"}}' VERCEL_STUB_EXIT=1 deploy --staged
echo "stops: --staged when vercel deploy fails, with its JSON"
[[ $STATUS -ne 0 ]] || fail "exit status was 0"
grep -q "vercel deploy failed: .*BUILD_ERROR" "$OUT" || fail "expected the JSON error in: $(cat "$OUT")"

new_repo
VERCEL_STUB_JSON='{"url":"https://jp-ski-def.vercel.app"}' deploy --staged
[[ $(tail -1 "$OUT") == https://jp-ski-def.vercel.app ]] || fail "top-level url, last line: $(tail -1 "$OUT")"

new_repo
VERCEL_STUB_JSON='{"status":"ok"}' deploy --staged
echo "stops: --staged without a URL in vercel's JSON"
[[ $STATUS -ne 0 ]] || fail "exit status was 0"
grep -q "no deployment URL" "$OUT" || fail "expected 'no deployment URL' in: $(cat "$OUT")"

new_repo
rm "$REPO/infra/valhalla/custom_files/hakuba/valhalla_tiles.tar"
deploy --staged
expect_stop "--staged without tiles" "tiles missing"

echo "promote moves the domain when HEAD is main's tip, and checks it"
new_repo
with_origin
STUB_DOMAIN=prod.example STUB_DOMAIN_ID=dpl_staged promote https://jp-ski-abc.vercel.app prod.example
expect_args "promote https://jp-ski-abc.vercel.app --yes"
grep -q "prod.example now serves" "$OUT" || fail "no domain check in: $(cat "$OUT")"

echo "promote skips when main has moved on"
new_repo
with_origin
git_q commit -q --allow-empty -m newer
git_q push -q origin HEAD:main
git_q reset -q --hard HEAD~1
promote https://jp-ski-abc.vercel.app prod.example
[[ $STATUS -eq 0 ]] || fail "exit status $STATUS: $(cat "$OUT")"
[[ ! -e $VERCEL_STUB_LOG ]] || fail "vercel was called: $(cat "$VERCEL_STUB_LOG")"
grep -q "not promoting" "$OUT" || fail "expected 'not promoting' in: $(cat "$OUT")"

echo "promote fails when the domain never serves the staged build"
new_repo
with_origin
STUB_DOMAIN=prod.example STUB_DOMAIN_ID=dpl_old promote https://jp-ski-abc.vercel.app prod.example
[[ $STATUS -ne 0 ]] || fail "exit status was 0"
grep -q "still doesn't serve" "$OUT" || fail "expected 'still doesn't serve' in: $(cat "$OUT")"

echo "promote fails when vercel promote fails"
VERCEL_STUB_EXIT=7 promote https://jp-ski-abc.vercel.app prod.example
[[ $STATUS -eq 7 ]] || fail "status $STATUS, want 7"

new_repo
promote https://jp-ski-abc.vercel.app prod.example
expect_stop "promote with no origin" "fatal"
promote https://jp-ski-abc.vercel.app
expect_stop "promote with one argument" "usage:"

echo "uses the npx copy when vercel is not on PATH"
new_repo
NPX_BIN="$HOME/.npm/_npx/abc123/node_modules/.bin"
mkdir -p "$NPX_BIN"
mv "$WORK/bin/vercel" "$NPX_BIN/vercel"
deploy
expect_args "deploy --environment preview"

rm -rf "$HOME/.npm"
deploy
expect_stop "no vercel CLI anywhere" "vercel CLI not found"

echo "committed deploy config is well formed"
REAL="$HERE/.."
grep -Eq '^[0-9a-f]{64}  valhalla_tiles\.tar$' "$REAL/infra/valhalla/hakuba-tiles.sha256" || fail "hash file format"
python3 -m json.tool "$REAL/vercel.json" >/dev/null || fail "vercel.json is not valid JSON"

if [[ $FAILED -ne 0 ]]; then
  echo "deploy-vercel tests: FAILED"
  exit 1
fi
echo "deploy-vercel tests: all passed"
