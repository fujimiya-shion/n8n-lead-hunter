-- =====================================================================
-- Chia đều quota Apify theo số đêm còn lại tới ngày reset
--   Facebook/đêm = (quota Apify còn lại ÷ số đêm còn lại tới ngày reset) → phần search + phần enrich
--   Google/đêm   = google_max_per_run (miễn phí, chỉ giới hạn để không bị Google chặn IP)
--   → mỗi nguồn tự chạy tối đa, không ràng buộc tỉ lệ
-- Quota/ngày reset lấy thật từ Apify (workflow 07 đồng bộ lúc 22:55).
-- Idempotent: áp lại lên DB đang chạy được.
-- =====================================================================

-- Cấu hình cũ không còn dùng
DELETE FROM settings WHERE key IN ('leads_per_run', 'fb_enrich_per_run', 'fb_overflow_to_google', 'google_pct');

INSERT INTO settings (key, value, description) VALUES
  ('google_max_per_run',    '100', 'Số lead Google mỗi ngày (miễn phí), chia đều cho các lượt chạy. Giới hạn để không bị Google chặn IP: ~20 lead/job, ~3-5 phút/job'),
  ('fb_monthly_budget_usd', '5',   'Ngân sách Apify tối đa mỗi chu kỳ (USD). Lấy giá trị nhỏ hơn giữa số này và hạn mức thật của Apify'),
  ('runs_per_day',          '1',   '(tự động) Số lượt chạy mỗi ngày, do scripts/install-scheduler.sh ghi theo SCHEDULE_TIMES'),
  ('fb_enrich_share_pct',   '20',  '% ngân sách mỗi đêm dành để enrich fanpage của lead Google. Phần còn lại dùng để tìm lead Facebook mới'),
  ('apify_usage_usd',       '',    '(tự động) Số tiền đã dùng trong chu kỳ, lấy từ Apify'),
  ('apify_limit_usd',       '',    '(tự động) Hạn mức chu kỳ của tài khoản Apify'),
  ('apify_cycle_start',     '',    '(tự động) Ngày bắt đầu chu kỳ Apify'),
  ('apify_cycle_end',       '',    '(tự động) Ngày reset quota Apify'),
  ('apify_synced_at',       '',    '(tự động) Lần cuối đồng bộ với Apify')
ON CONFLICT (key) DO NOTHING;

UPDATE settings SET description = 'Số lead Google mỗi ngày (miễn phí), chia đều cho các lượt chạy. Giới hạn để không bị Google chặn IP: ~20 lead/job, ~3-5 phút/job'
WHERE key = 'google_max_per_run';

CREATE OR REPLACE FUNCTION setting_text(k text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(value, '') FROM settings WHERE key = k $$;

CREATE OR REPLACE FUNCTION setting_num(k text) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT nullif(value, '')::numeric FROM settings WHERE key = k $$;

-- Lưu dữ liệu từ GET https://api.apify.com/v2/users/me/limits
CREATE OR REPLACE FUNCTION sync_apify_limits(p jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE d jsonb := coalesce(p->'data', p);
BEGIN
  IF d->'current'->>'monthlyUsageUsd' IS NULL THEN
    RAISE EXCEPTION 'Phản hồi Apify không hợp lệ: %', left(p::text, 300);
  END IF;
  UPDATE settings SET value = d->'current'->>'monthlyUsageUsd'         WHERE key = 'apify_usage_usd';
  UPDATE settings SET value = coalesce(d->'limits'->>'maxMonthlyUsageUsd', '') WHERE key = 'apify_limit_usd';
  UPDATE settings SET value = coalesce(d->'monthlyUsageCycle'->>'startAt', '') WHERE key = 'apify_cycle_start';
  UPDATE settings SET value = coalesce(d->'monthlyUsageCycle'->>'endAt', '')   WHERE key = 'apify_cycle_end';
  UPDATE settings SET value = now()::text                                      WHERE key = 'apify_synced_at';
  RETURN jsonb_build_object('usage', d->'current'->'monthlyUsageUsd',
                            'limit', d->'limits'->'maxMonthlyUsageUsd',
                            'cycle_end', d->'monthlyUsageCycle'->'endAt');
END $$;

-- Đã tiêu trong chu kỳ: số thật của Apify (nếu đồng bộ trong 26 giờ) + job của mình chạy sau lần đồng bộ
CREATE OR REPLACE FUNCTION fb_spent_this_month() RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_sync  timestamptz := setting_text('apify_synced_at')::timestamptz;
  v_base  numeric := 0;
  v_since timestamptz;
BEGIN
  IF v_sync IS NOT NULL AND v_sync > now() - interval '26 hours' THEN
    v_base  := coalesce(setting_num('apify_usage_usd'), 0);
    v_since := v_sync;
  ELSE
    v_since := coalesce(setting_text('apify_cycle_start')::timestamptz, date_trunc('month', now()));
  END IF;
  RETURN v_base + coalesce((
    SELECT sum(coalesce(cost_usd,
             CASE WHEN status = 'running'
                  THEN coalesce(max_places, 0) * setting_num('fb_search_cost_per_result') ELSE 0 END))
    FROM crawl_jobs WHERE source LIKE 'apify_%' AND started_at >= v_since), 0);
END $$;

DROP VIEW IF EXISTS v_run_plan;
DROP FUNCTION IF EXISTS run_targets();

CREATE FUNCTION run_targets()
RETURNS TABLE (leads_per_run int, google_target int, fb_target int, fb_enrich_limit int,
               fb_budget_left_usd numeric, fb_budget_per_night_usd numeric,
               nights_left int, apify_reset_at timestamptz)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_budget numeric := least(setting_num('fb_monthly_budget_usd'),
                            coalesce(setting_num('apify_limit_usd'), setting_num('fb_monthly_budget_usd')));
  v_reset  timestamptz := coalesce(setting_text('apify_cycle_end')::timestamptz,
                                   date_trunc('month', now()) + interval '1 month');
  v_left   numeric;
  v_nights int;
  v_night  numeric;
  v_share  numeric := least(greatest(coalesce(setting_num('fb_enrich_share_pct'), 0), 0), 100) / 100.0;
  v_runs   int := greatest(coalesce(setting_num('runs_per_day'), 1), 1)::int;
  v_gmax   int := ceil(coalesce(setting_num('google_max_per_run'), 100) / v_runs);
  v_f int; v_e int; v_g int;
BEGIN
  -- Chu kỳ đã qua mà chưa đồng bộ lại: coi như quota mới
  IF v_reset < now() THEN v_reset := v_reset + interval '1 month'; END IF;

  v_left   := greatest(v_budget - fb_spent_this_month(), 0);
  -- Số lượt còn lại tới ngày reset = số ngày còn lại × số lượt mỗi ngày
  v_nights := greatest(ceil(extract(epoch FROM (v_reset - now())) / 86400.0)::int, 1) * v_runs;
  v_night  := v_left / v_nights;

  -- Facebook: tiêu đều quota Apify còn lại tới ngày reset
  v_f := floor(v_night * (1 - v_share) / setting_num('fb_search_cost_per_result'));
  v_e := floor(v_night * v_share / setting_num('fb_enrich_cost_per_page'));
  -- Google: miễn phí → luôn chạy tối đa mức an toàn
  v_g := greatest(v_gmax, 0);

  RETURN QUERY SELECT v_g + v_f, v_g, v_f, v_e, round(v_left, 2), round(v_night, 3), v_nights, v_reset;
END $$;

CREATE VIEW v_run_plan AS
SELECT t.*, round(fb_spent_this_month(), 2) AS fb_spent_this_month_usd,
       (SELECT string_agg(keyword, ', ' ORDER BY priority DESC) FROM industries WHERE active) AS active_industries,
       (SELECT string_agg(name, ', ') FROM locations WHERE active) AS active_locations
FROM run_targets() t;
