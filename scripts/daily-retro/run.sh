#!/bin/bash
# Daily role retro, run by launchd at 06:00 (see install.sh). Read-only on the repo: Claude may
# write only under .ops/ (gitignored). Logs go to ~/Library/Logs, which macOS privacy rules leave open.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$HOME/Library/Logs/jp_ski_map-daily-retro.log"
TODAY="$(date +%F)"
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:$PATH"
exec >>"$LOG" 2>&1
echo "== $(date '+%F %T') start"

notify() { osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true; }

if ! cd "$REPO" 2>/dev/null || ! ls "$REPO/CLAUDE.md" >/dev/null 2>&1; then
  echo "cannot read $REPO: grant bash and claude access to that folder (install.sh, step 3)"
  notify "jp_ski_map retro" "Can't read the repo folder; see ~/Library/Logs/jp_ski_map-daily-retro.log"
  exit 1
fi
if [ -f ".ops/reports/$TODAY.md" ]; then echo "already ran today"; exit 0; fi
command -v claude >/dev/null || { echo "claude CLI not on PATH"; notify "jp_ski_map retro" "claude CLI not found"; exit 1; }

mkdir -p .ops/reports
git fetch --quiet --all --prune || echo "git fetch failed; using local refs"

claude -p "Run the daily-retro skill for $TODAY. Write only under .ops/." \
  --allowedTools "Skill,Agent,Task,Read,Grep,Glob,WebSearch,WebFetch,Write(./.ops/**),Edit(./.ops/**),Bash(python3 scripts/daily_retro.py:*),Bash(git show:*),Bash(git log:*),Bash(git diff:*),Bash(grep:*),Bash(wc:*)" \
  --output-format text
status=$?

if [ -f ".ops/reports/$TODAY.md" ]; then
  summary="$(head -c 230 .ops/reports/latest-summary.txt 2>/dev/null | tr '\n' ' ' | tr -d '"')"
  notify "jp_ski_map retro $TODAY" "${summary:-Report ready in .ops/reports}"
else
  notify "jp_ski_map retro" "No report today (exit $status); see the log"
fi
echo "== $(date '+%F %T') end, exit $status"
