#!/bin/bash
# Install (or reinstall) the 06:00 daily retro as a launchd agent for this user. macOS only.
#   scripts/daily-retro/install.sh             install and load
#   scripts/daily-retro/install.sh --uninstall remove it
set -euo pipefail
LABEL=com.jpskimap.daily-retro
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--uninstall" ]; then rm -f "$PLIST"; echo "removed $LABEL"; exit 0; fi

mkdir -p "$HOME/Library/LaunchAgents"
cat >"$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$REPO/scripts/daily-retro/run.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/jp_ski_map-daily-retro.launchd.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/jp_ski_map-daily-retro.launchd.log</string>
</dict></plist>
PL
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "loaded $LABEL: runs at 06:00, or at the next wake if the Mac was asleep (not if it was off)."
cat <<NEXT
Next:
 1. Try it now:  launchctl kickstart gui/$(id -u)/com.jpskimap.daily-retro
                 tail -f ~/Library/Logs/jp_ski_map-daily-retro.log
 2. Optional, to run at 06:00 sharp:  sudo pmset repeat wakeorpoweron MTWRFSU 05:58:00
 3. If the log says it cannot read the repo: the repo is under ~/Desktop, which macOS guards.
    System Settings > Privacy & Security > Full Disk Access: add /bin/bash and the claude binary
    ($(command -v claude)), or move the repo out of ~/Desktop.
NEXT
