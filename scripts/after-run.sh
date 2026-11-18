#!/usr/bin/env bash
# Chạy sau run-pipeline.sh (ExecStopPost). Cho máy ngủ lại CHỈ KHI:
#   - máy được timer đánh thức để chạy job, VÀ
#   - không ai đang dùng: màn hình vẫn khoá hoặc nắp laptop đang gập
# Nếu bạn đã mở máy ra dùng trong lúc job chạy → không động vào.
set -uo pipefail
log() { echo "[$(date '+%F %T')] $*"; }

WOKE=$(cat /run/lead-hunter/woke 2>/dev/null || cat /tmp/woke 2>/dev/null || echo 0)
if [ "$WOKE" != "1" ]; then log "Máy không phải do timer đánh thức → giữ nguyên"; exit 0; fi

LID=$(grep -ho 'closed' /proc/acpi/button/lid/*/state 2>/dev/null | head -1)
SESSION=$(loginctl list-sessions --no-legend 2>/dev/null | awk '$4 == "seat0" {print $1; exit}')
LOCKED=no
[ -n "$SESSION" ] && LOCKED=$(loginctl show-session "$SESSION" -p LockedHint --value 2>/dev/null || echo no)

if [ "$LID" = "closed" ] || [ "$LOCKED" = "yes" ] || [ -z "$SESSION" ]; then
  log "Không ai dùng máy (nắp: ${LID:-open}, khoá màn hình: $LOCKED) → cho máy ngủ lại"
  rm -f /run/lead-hunter/woke
  sleep 5
  systemctl suspend
else
  log "Bạn đang dùng máy → không cho ngủ"
fi
