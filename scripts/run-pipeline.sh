#!/usr/bin/env bash
# Chạy 1 lượt lấy lead:
#   07 đồng bộ quota Apify → 01 gửi job Maps → 05 gửi job Facebook
#   → chờ 03/06 (n8n, 5 phút/lần) thu hết kết quả → 02 audit website → 04 enrich fanpage
# Được gọi bởi systemd (lead-hunter.service). Có thể chạy tay: sudo systemctl start lead-hunter
#   DRY_RUN=1 scripts/run-pipeline.sh  → chỉ đồng bộ quota + in kế hoạch, không gửi job, không tốn credit
set -uo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
set -a; . ./.env; set +a

STATE_DIR=/run/lead-hunter
mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR=/tmp
MAX_WAIT_MIN="${SCHEDULE_MAX_WAIT_MIN:-120}"
MIN_BATTERY="${SCHEDULE_MIN_BATTERY:-30}"

log() { echo "[$(date '+%F %T')] $*"; }
q()   { docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null; }
wf()  {
  log "▶ workflow $1"
  docker compose exec -T -e N8N_RUNNERS_BROKER_PORT=5690 -e QUEUE_HEALTH_CHECK_PORT=5691 \
    n8n n8n execute --id "$1" >/dev/null 2>&1 || log "  ⚠ workflow $1 báo lỗi (xem tab Executions trong n8n)"
}

# Máy có vừa được timer đánh thức không? (after-run.sh dùng để quyết định ngủ lại)
if journalctl -k -b --since "-10min" -g "PM: suspend exit" -q --no-pager >/dev/null 2>&1; then
  echo 1 > "$STATE_DIR/woke"; log "Máy vừa được đánh thức để chạy job"
else
  echo 0 > "$STATE_DIR/woke"; log "Máy đang thức sẵn (không tự ngủ lại sau khi chạy)"
fi

# Đang dùng pin và pin yếu → bỏ qua lượt này
AC=$(cat /sys/class/power_supply/AC*/online 2>/dev/null | head -1)
BAT=$(cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -1)
if [ "${AC:-1}" = "0" ] && [ -n "${BAT:-}" ] && [ "$BAT" -lt "$MIN_BATTERY" ]; then
  log "Đang dùng pin ${BAT}% < ${MIN_BATTERY}% → bỏ qua lượt này"; exit 0
fi

# Máy vừa khởi động (lượt chạy bù sau shutdown): chờ Docker bật lại container, tối đa 3 phút
UPTIME_S=$(cut -d. -f1 /proc/uptime)
if [ "$UPTIME_S" -lt 600 ]; then
  log "Máy mới khởi động ${UPTIME_S}s → chờ container sẵn sàng"
  for i in $(seq 1 36); do
    [ -n "$(docker compose ps -q --status running n8n 2>/dev/null)" ] && break
    sleep 5
  done
fi

# Bạn đã chủ động tắt hệ thống (docker compose stop) → tôn trọng, không chạy
if [ -z "$(docker compose ps -q --status running n8n 2>/dev/null)" ]; then
  log "n8n đang tắt (docker compose stop?) → bỏ qua lượt này"; exit 0
fi

nm-online -q -t 120 || log "⚠ Chưa có mạng sau 120 giây, vẫn thử chạy"
for i in $(seq 1 30); do
  docker compose exec -T n8n wget -qO- http://localhost:5678/healthz >/dev/null 2>&1 && break
  sleep 5
done

wf LhSyncApifyQta1
log "Kế hoạch: $(q "SELECT 'google=' || google_target || ', facebook=' || fb_target || ', enrich=' || fb_enrich_limit || ', Apify còn \$' || fb_budget_left_usd || ' cho ' || nights_left || ' lượt' FROM run_targets()")"

if [ "${DRY_RUN:-0}" = "1" ]; then log "DRY_RUN=1 → dừng ở đây, không gửi job"; exit 0; fi

START_TS=$(q "SELECT now()")
wf LhCrawlMaps00001
wf LhFbSearchSend01

# Chờ n8n (03/06, 5 phút/lần) thu hết kết quả
DEADLINE=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))
while :; do
  RUNNING=$(q "SELECT count(*) FROM crawl_jobs WHERE status = 'running' AND external_id IS NOT NULL AND started_at >= '$START_TS'")
  [ "${RUNNING:-0}" = "0" ] && break
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    log "⚠ Quá ${MAX_WAIT_MIN} phút còn ${RUNNING} job chưa xong → để n8n thu tiếp khi máy thức lần sau"; break
  fi
  log "  còn ${RUNNING} job đang chạy..."
  sleep 60
done

wf LhAuditWebsite01
wf LhEnrichFbPage01

log "Xong: $(q "SELECT 'lead mới ' || count(*) || ', cần gọi ' || count(*) FILTER (WHERE status = 'to_contact') FROM businesses WHERE first_seen_at >= '$START_TS'"); tổng cần gọi: $(q "SELECT count(*) FROM businesses WHERE status = 'to_contact'")"
