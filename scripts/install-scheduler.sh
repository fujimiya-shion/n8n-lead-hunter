#!/usr/bin/env bash
# Cài lịch tự chạy bằng systemd: đánh thức máy → chạy job → ngủ lại.
# Giờ chạy lấy từ SCHEDULE_TIMES trong .env (vd "23:00" hoặc "09:00,13:00,17:00").
# Chạy lại script này mỗi khi đổi SCHEDULE_TIMES.   Gỡ: scripts/install-scheduler.sh --uninstall
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT=lead-hunter

if [ "${1:-}" = "--uninstall" ]; then
  sudo systemctl disable --now "$UNIT.timer" 2>/dev/null || true
  sudo rm -f "/etc/systemd/system/$UNIT.service" "/etc/systemd/system/$UNIT.timer"
  sudo systemctl daemon-reload
  echo "Đã gỡ lịch $UNIT"; exit 0
fi

set -a; . "$DIR/.env"; set +a
TIMES="${SCHEDULE_TIMES:-23:00}"
chmod +x "$DIR/scripts/run-pipeline.sh" "$DIR/scripts/after-run.sh"

ONCAL=""
IFS=',' read -ra ARR <<< "$TIMES"
for t in "${ARR[@]}"; do
  t="$(echo "$t" | tr -d ' ')"
  [[ "$t" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "Giờ không hợp lệ trong SCHEDULE_TIMES: '$t' (dạng HH:MM)"; exit 1; }
  ONCAL+="OnCalendar=*-*-* ${t}:00"$'\n'
done

sudo tee "/etc/systemd/system/$UNIT.service" >/dev/null <<EOF
[Unit]
Description=Lead Hunter: chạy 1 lượt lấy lead (Google Maps + Facebook)
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
# Chặn sleep, idle và "gập nắp là sleep" trong lúc job chạy
ExecStart=/usr/bin/systemd-inhibit --what=sleep:idle:handle-lid-switch --who="Lead Hunter" --why="Đang lấy lead" --mode=block $DIR/scripts/run-pipeline.sh
# Chạy xong: nếu máy được timer đánh thức và không ai dùng → ngủ lại
ExecStopPost=$DIR/scripts/after-run.sh
TimeoutStartSec=4h
EOF

sudo tee "/etc/systemd/system/$UNIT.timer" >/dev/null <<EOF
[Unit]
Description=Lead Hunter: đánh thức máy và chạy job theo lịch

[Timer]
${ONCAL}WakeSystem=true
Persistent=true
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

# Ghi số lượt/ngày vào DB để chia ngân sách Apify và số lead Google theo từng lượt
( cd "$DIR" && docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc \
    "UPDATE settings SET value = '${#ARR[@]}' WHERE key = 'runs_per_day'" ) \
  || echo "⚠ Không ghi được runs_per_day vào DB (Postgres đang tắt?)"

sudo systemctl daemon-reload
sudo systemctl enable --now "$UNIT.timer"
echo "Đã cài lịch: ${TIMES}"
systemctl list-timers "$UNIT.timer" --no-pager
