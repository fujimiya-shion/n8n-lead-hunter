-- =====================================================================
-- Lớp thống kê cho Metabase (view a_*) + cột phục vụ NocoDB
-- Idempotent: áp lại lên DB đang chạy được.
-- =====================================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS next_call_at  timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry_name text;

-- Nhãn tiếng Việt dùng chung
CREATE OR REPLACE FUNCTION source_label(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'gosom_maps' THEN 'Google Maps' WHEN 'apify_facebook' THEN 'Facebook'
                WHEN 'apify_fb_enrich' THEN 'Facebook enrich' ELSE s END $$;

CREATE OR REPLACE FUNCTION status_label(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'new' THEN '1. Mới' WHEN 'to_contact' THEN '2. Cần gọi' WHEN 'contacted' THEN '3. Đã liên hệ'
                WHEN 'interested' THEN '4. Quan tâm' WHEN 'won' THEN '5. Chốt' WHEN 'lost' THEN '6. Thất bại'
                WHEN 'skip' THEN '7. Bỏ qua' ELSE s END $$;

CREATE OR REPLACE FUNCTION website_label(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s WHEN 'none' THEN 'Chưa có website' WHEN 'social' THEN 'Chỉ có mạng xã hội'
                WHEN 'marketplace' THEN 'Chỉ có sàn TMĐT' WHEN 'freebuilder' THEN 'Web công cụ miễn phí'
                WHEN 'real' THEN 'Có website riêng' ELSE s END $$;

-- ---------------------------------------------------------------------
-- Bảng phẳng: 1 dòng / lead với mọi thông số (nguồn cho hầu hết biểu đồ + bộ lọc)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW a_leads AS
SELECT b.id, b.name, b.score,
       CASE WHEN b.score >= 80 THEN '80+ Rất nóng' WHEN b.score >= 60 THEN '60–79 Nóng'
            WHEN b.score >= 40 THEN '40–59 Ấm' WHEN b.score >= 20 THEN '20–39 Nguội' ELSE '0–19 Lạnh' END AS score_band,
       b.status::text AS status, status_label(b.status::text) AS status_label,
       source_label(b.source) AS source,
       coalesce(i.keyword, '(không rõ)') AS industry, coalesce(i.priority, 0) AS industry_priority,
       coalesce(b.search_area, '(không rõ)') AS area, b.ward,
       b.website_type, website_label(b.website_type) AS website_label,
       b.website_type <> 'real' AS no_real_website,
       b.phone IS NOT NULL AS has_phone, b.emails IS NOT NULL AS has_email, b.facebook_url IS NOT NULL AS has_facebook,
       b.rating, b.review_count,
       a.reachable AS web_reachable, a.has_ssl, a.is_mobile_friendly, a.copyright_year, coalesce(a.cms, CASE WHEN a.business_id IS NOT NULL THEN 'Không xác định' END) AS cms,
       f.followers AS fb_followers, f.is_running_ads AS fb_running_ads,
       b.phone, b.emails, b.website_url, b.facebook_url, b.maps_url, b.score_reasons, b.note,
       b.first_seen_at, b.first_seen_at::date AS first_seen_date, b.contacted_at, b.next_call_at, b.lat, b.lng
FROM businesses b
LEFT JOIN industries i     ON i.id = b.industry_id
LEFT JOIN web_audit a      ON a.business_id = b.id
LEFT JOIN facebook_pages f ON f.business_id = b.id;

-- ---------------------------------------------------------------------
-- Thống kê theo nhóm (ngành / khu vực / nguồn) cùng một bộ chỉ số
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW a_by_industry AS
SELECT industry AS "Ngành", max(industry_priority) AS "Priority",
       count(*) AS "Lead",
       count(*) FILTER (WHERE status = 'to_contact') AS "Cần gọi",
       count(*) FILTER (WHERE score >= 80) AS "Rất nóng (80+)",
       count(*) FILTER (WHERE status IN ('contacted','interested','won','lost')) AS "Đã liên hệ",
       count(*) FILTER (WHERE status = 'won') AS "Chốt",
       round(100.0 * count(*) FILTER (WHERE no_real_website) / count(*), 1) AS "% chưa có web thật",
       round(avg(score), 1) AS "Điểm TB",
       round(avg(rating), 2) AS "Rating TB",
       round(avg(review_count)) AS "Review TB",
       round(100.0 * count(*) FILTER (WHERE has_phone) / count(*), 1) AS "% có SĐT",
       round(100.0 * count(*) FILTER (WHERE has_email) / count(*), 1) AS "% có email",
       round(100.0 * count(*) FILTER (WHERE has_facebook) / count(*), 1) AS "% có fanpage"
FROM a_leads GROUP BY industry;

CREATE OR REPLACE VIEW a_by_area AS
SELECT area AS "Khu vực",
       count(*) AS "Lead",
       count(*) FILTER (WHERE status = 'to_contact') AS "Cần gọi",
       count(*) FILTER (WHERE score >= 80) AS "Rất nóng (80+)",
       count(*) FILTER (WHERE status = 'won') AS "Chốt",
       round(100.0 * count(*) FILTER (WHERE no_real_website) / count(*), 1) AS "% chưa có web thật",
       round(avg(score), 1) AS "Điểm TB",
       round(100.0 * count(*) FILTER (WHERE has_phone) / count(*), 1) AS "% có SĐT",
       round(100.0 * count(*) FILTER (WHERE has_email) / count(*), 1) AS "% có email"
FROM a_leads GROUP BY area;

CREATE OR REPLACE VIEW a_by_source AS
SELECT source AS "Nguồn",
       count(*) AS "Lead",
       count(*) FILTER (WHERE status = 'to_contact') AS "Cần gọi",
       count(*) FILTER (WHERE score >= 80) AS "Rất nóng (80+)",
       count(*) FILTER (WHERE status IN ('contacted','interested','won','lost')) AS "Đã liên hệ",
       count(*) FILTER (WHERE status = 'won') AS "Chốt",
       round(avg(score), 1) AS "Điểm TB",
       round(100.0 * count(*) FILTER (WHERE has_phone) / count(*), 1) AS "% có SĐT",
       round(100.0 * count(*) FILTER (WHERE has_email) / count(*), 1) AS "% có email",
       round(100.0 * count(*) FILTER (WHERE no_real_website) / count(*), 1) AS "% chưa có web thật"
FROM a_leads GROUP BY source;

-- ---------------------------------------------------------------------
-- Sức khoẻ website của lead (đã audit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW a_web_health AS
SELECT 'Website chết / lỗi' AS "Vấn đề", count(*) FILTER (WHERE web_reachable = false) AS "Số lead" FROM a_leads
UNION ALL SELECT 'Không có SSL (http)',        count(*) FILTER (WHERE web_reachable AND has_ssl = false) FROM a_leads
UNION ALL SELECT 'Không responsive (mobile)',  count(*) FILTER (WHERE web_reachable AND is_mobile_friendly = false) FROM a_leads
UNION ALL SELECT 'Copyright trước 2021',       count(*) FILTER (WHERE copyright_year < 2021) FROM a_leads
UNION ALL SELECT 'Web ổn (SSL + mobile)',      count(*) FILTER (WHERE web_reachable AND has_ssl AND is_mobile_friendly) FROM a_leads;

-- ---------------------------------------------------------------------
-- Vận hành: job crawl theo ngày, chi phí Apify luỹ kế so với ngân sách, độ phủ ngành × khu vực
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW a_jobs_daily AS
SELECT started_at::date AS "Ngày", source_label(source) AS "Nguồn",
       count(*) AS "Job",
       count(*) FILTER (WHERE status = 'done') AS "Thành công",
       count(*) FILTER (WHERE status = 'failed') AS "Lỗi",
       count(*) FILTER (WHERE status = 'running') AS "Đang chạy",
       coalesce(sum(found), 0) AS "Tìm thấy",
       coalesce(sum(new_leads), 0) AS "Lead mới",
       round(coalesce(sum(cost_usd), 0), 3) AS "Chi phí ($)",
       round(avg(extract(epoch FROM finished_at - started_at) / 60) FILTER (WHERE status = 'done'), 1) AS "Phút TB/job"
FROM crawl_jobs GROUP BY 1, 2;

CREATE OR REPLACE VIEW a_apify_cost AS
WITH d AS (
  SELECT started_at::date AS ngay, sum(coalesce(cost_usd, 0)) AS chi_phi
  FROM crawl_jobs WHERE source LIKE 'apify_%' GROUP BY 1
)
SELECT ngay AS "Ngày", round(chi_phi, 3) AS "Chi phí ngày ($)",
       round(sum(chi_phi) OVER (ORDER BY ngay), 3) AS "Luỹ kế ($)",
       least(setting_num('fb_monthly_budget_usd'), coalesce(setting_num('apify_limit_usd'), setting_num('fb_monthly_budget_usd'))) AS "Ngân sách ($)"
FROM d;

CREATE OR REPLACE VIEW a_coverage AS
WITH pairs AS (
  SELECT i.priority, i.id AS iid, l.id AS lid
  FROM industries i CROSS JOIN locations l WHERE i.active AND l.active
), done AS (
  SELECT DISTINCT industry_id, location_id, source FROM crawl_jobs
  WHERE status = 'done' AND started_at > now() - interval '30 days'
)
SELECT 'P' || p.priority AS "Nhóm ngành",
       count(*) AS "Tổng cặp ngành × khu vực",
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM done d WHERE d.industry_id = p.iid AND d.location_id = p.lid AND d.source = 'gosom_maps')) AS "Đã chạy Google",
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM done d WHERE d.industry_id = p.iid AND d.location_id = p.lid AND d.source = 'apify_facebook')) AS "Đã chạy Facebook",
       round(100.0 * count(*) FILTER (WHERE EXISTS (SELECT 1 FROM done d WHERE d.industry_id = p.iid AND d.location_id = p.lid AND d.source = 'gosom_maps')) / count(*), 1) AS "% phủ Google"
FROM pairs p GROUP BY p.priority;

-- ---------------------------------------------------------------------
-- Hoạt động liên hệ của bạn theo ngày
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW a_contact_activity AS
SELECT contacted_at::date AS "Ngày",
       count(*) AS "Đã liên hệ",
       count(*) FILTER (WHERE status = 'interested') AS "Quan tâm",
       count(*) FILTER (WHERE status = 'won') AS "Chốt",
       count(*) FILTER (WHERE status = 'lost') AS "Thất bại"
FROM businesses WHERE contacted_at IS NOT NULL GROUP BY 1;

SELECT rescore();
