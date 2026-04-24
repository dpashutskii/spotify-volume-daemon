#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Spotify Volume Daemon
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🎵
# @raycast.packageName Spotify Tools
# @raycast.description Toggle the Spotify volume daemon (auto-clamps soundbar volume on connect)

PID_FILE="$HOME/.spotify-daemon/daemon.pid"
DAEMON_SCRIPT="$HOME/.spotify-daemon/daemon.js"
LOG_FILE="$HOME/.spotify-daemon/daemon.log"

# ── Verify daemon script exists ──────────────────────────────────────────────
if [ ! -f "$DAEMON_SCRIPT" ]; then
  echo "❌ daemon.js not found at $DAEMON_SCRIPT — run setup first"
  exit 1
fi

# ── Helper: is daemon actually running? ──────────────────────────────────────
is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0  # running
    else
      rm -f "$PID_FILE"  # stale PID file
    fi
  fi
  return 1  # not running
}

# ── Toggle ────────────────────────────────────────────────────────────────────
if is_running; then
  PID=$(cat "$PID_FILE")
  kill "$PID"
  rm -f "$PID_FILE"
  echo "🔇 Daemon stopped"
else
  nohup node "$DAEMON_SCRIPT" >> "$LOG_FILE" 2>&1 &
  echo "🎵 Daemon started"
fi
