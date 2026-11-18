-- =====================================================================
-- Config chạy (bảng settings) + nguồn Facebook search + chặn ngân sách Apify
-- Chạy sau 01-schema.sql. Viết idempotent để áp lại lên DB đang chạy được.
-- =====================================================================

CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text
);

INSERT INTO settings (key, value, description) VALUES
  ('leads_per_run',             '40',    'Tổng số lead mới muốn lấy mỗi đêm (Google + Facebook)'),
  ('google_pct',                '50',    '% lead lấy từ Google Maps. Facebook = 100 - giá trị này'),
  ('gmaps_places_per_job',      '20',    'Ước lượng số địa điểm mỗi job gosom (depth 1 ≈ 20). Dùng để tính số job'),
  ('gmaps_depth',               '1',     'Độ sâu cuộn kết quả của gosom (1 ≈ 20 địa điểm)'),
  ('gmaps_email',               'true',  'gosom vào website doanh nghiệp để lấy email (true/false)'),
  ('fb_results_per_job',        '25',    'Số fanpage tối đa mỗi job tìm kiếm Facebook'),
  ('fb_monthly_budget_usd',     '5',     'Ngân sách Apify mỗi tháng (USD). Hết thì dừng mọi job Facebook'),
  ('fb_overflow_to_google',     'true',  'Hết ngân sách Facebook thì dồn phần lead đó sang Google (true/false)'),
  ('fb_search_cost_per_result', '0.006', 'Giá apify/facebook-search-scraper mỗi kết quả (gói Free)'),
  ('fb_enrich_cost_per_page',   '0.012', 'Giá apify/facebook-pages-scraper mỗi page (gói Free)'),
  ('fb_enrich_per_run',         '5',     'Số fanpage của lead Google Maps được enrich mỗi đêm')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION setting_num(k text) RETURNS numeric
LANGUAGE sql STABLE AS $$ SELECT value::numeric FROM settings WHERE key = k $$;

CREATE OR REPLACE FUNCTION setting_bool(k text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT lower(value) IN ('true','1','yes','on') FROM settings WHERE key = k $$;

ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS cost_usd numeric(10,4);
ALTER TABLE locations  ADD COLUMN IF NOT EXISTS fb_city text NOT NULL DEFAULT 'Ho Chi Minh City';

-- ---------------------------------------------------------------------
-- Ngân sách Apify đã dùng trong tháng (job đang chạy tính theo ước lượng tối đa)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fb_spent_this_month() RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(coalesce(cost_usd,
           CASE WHEN status = 'running'
                THEN coalesce(max_places, 0) * setting_num('fb_search_cost_per_result') ELSE 0 END)), 0)
  FROM crawl_jobs
  WHERE source LIKE 'apify_%' AND started_at >= date_trunc('month', now())
$$;

-- ---------------------------------------------------------------------
-- Mục tiêu của lần chạy: tổng lead × tỉ lệ → Google / Facebook (đã trừ ngân sách)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION run_targets()
RETURNS TABLE (leads_per_run int, google_target int, fb_target int,
               fb_budget_left_usd numeric, fb_enrich_limit int)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total int     := setting_num('leads_per_run');
  v_g     int;
  v_f     int;
  v_left  numeric := greatest(setting_num('fb_monthly_budget_usd') - fb_spent_this_month(), 0);
  v_afford int    := floor(v_left / setting_num('fb_search_cost_per_result'));
BEGIN
  v_g := round(v_total * least(greatest(setting_num('google_pct'), 0), 100) / 100.0);
  v_f := v_total - v_g;
  IF v_f > v_afford THEN
    IF setting_bool('fb_overflow_to_google') THEN v_g := v_g + (v_f - v_afford); END IF;
    v_f := v_afford;
  END IF;
  RETURN QUERY SELECT v_total, v_g, v_f, round(v_left, 2),
    least(setting_num('fb_enrich_per_run')::int,
          floor(v_left / setting_num('fb_enrich_cost_per_page'))::int);
END $$;

-- ---------------------------------------------------------------------
-- Lên job theo nguồn: số job = ceil(mục tiêu / số kết quả mỗi job)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS plan_crawl_jobs(int, int);
DROP FUNCTION IF EXISTS plan_crawl_jobs(int, int, text);

CREATE OR REPLACE FUNCTION plan_crawl_jobs(p_source text)
RETURNS TABLE (job_id bigint, keyword text, location_name text, location_query text,
               fb_city text, max_results int, depth int, email boolean)
LANGUAGE plpgsql AS $$
DECLARE t record; v_target int; v_per_job int; v_jobs int;
BEGIN
  -- job "running" quá 3 giờ coi như hỏng
  UPDATE crawl_jobs SET status = 'failed', error = 'stale', finished_at = now()
  WHERE status = 'running' AND started_at < now() - interval '3 hours';

  SELECT * INTO t FROM run_targets();
  IF p_source = 'gosom_maps' THEN
    v_target := t.google_target; v_per_job := setting_num('gmaps_places_per_job');
  ELSIF p_source = 'apify_facebook' THEN
    v_target := t.fb_target;     v_per_job := setting_num('fb_results_per_job');
  ELSE
    RAISE EXCEPTION 'Nguồn không hợp lệ: %', p_source;
  END IF;
  IF coalesce(v_target, 0) <= 0 THEN RETURN; END IF;
  v_jobs := ceil(v_target::numeric / greatest(v_per_job, 1));

  RETURN QUERY
  WITH picked AS (
    SELECT i.id AS iid, l.id AS lid
    FROM industries i CROSS JOIN locations l
    WHERE i.active AND l.active
      AND NOT EXISTS (
        SELECT 1 FROM crawl_jobs j
        WHERE j.industry_id = i.id AND j.location_id = l.id AND j.source = p_source
          AND (j.status = 'running'
               OR (j.status = 'done' AND j.started_at > now() - interval '30 days'))
      )
    ORDER BY i.priority DESC, random()
    LIMIT v_jobs
  ), ins AS (
    INSERT INTO crawl_jobs (industry_id, location_id, source, max_places)
    SELECT iid, lid, p_source,
           CASE WHEN p_source = 'apify_facebook' THEN ceil(v_target::numeric / v_jobs)::int
                ELSE v_per_job END
    FROM picked
    RETURNING id, industry_id, location_id, crawl_jobs.max_places
  )
  SELECT ins.id, i.keyword, l.name, l.query, l.fb_city, ins.max_places,
         setting_num('gmaps_depth')::int, setting_bool('gmaps_email')
  FROM ins JOIN industries i ON i.id = ins.industry_id
           JOIN locations  l ON l.id = ins.location_id;
END $$;

-- ---------------------------------------------------------------------
-- Ghi 1 fanpage (dùng chung cho enrich và search)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_fb_page(p_bid bigint, p_url text, it jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO facebook_pages AS f (business_id, page_url, page_name, page_id, categories,
      followers, likes, email, phone, website, rating, creation_date, ad_status,
      is_running_ads, intro, found, raw, scraped_at)
  VALUES (p_bid, p_url,
      coalesce(it->>'title', it->>'pageName'),
      coalesce(it->>'pageId', it->>'facebookId'),
      CASE WHEN jsonb_typeof(it->'categories') = 'array'
           THEN (SELECT string_agg(c, ', ') FROM jarr(it->'categories') c) END,
      to_int(it->>'followers'),
      to_int(it->>'likes'),
      it->>'email',
      it->>'phone',
      coalesce(it->>'website', (SELECT w FROM jarr(it->'websites') w LIMIT 1)),
      coalesce(it->>'rating', it->>'ratingOverall'),
      it->>'creation_date',
      it->>'ad_status',
      CASE WHEN it->>'ad_status' IS NULL THEN NULL
           ELSE (it->>'ad_status') !~* '(not currently|không)' END,
      left(it->>'intro', 1000),
      it IS NOT NULL,
      it,
      now())
  ON CONFLICT (business_id) DO UPDATE SET
    page_url = EXCLUDED.page_url, page_name = EXCLUDED.page_name, page_id = EXCLUDED.page_id,
    categories = EXCLUDED.categories, followers = EXCLUDED.followers, likes = EXCLUDED.likes,
    email = EXCLUDED.email, phone = EXCLUDED.phone, website = EXCLUDED.website,
    rating = EXCLUDED.rating, creation_date = EXCLUDED.creation_date,
    ad_status = EXCLUDED.ad_status, is_running_ads = EXCLUDED.is_running_ads,
    intro = EXCLUDED.intro, found = EXCLUDED.found, raw = EXCLUDED.raw, scraped_at = now();

  IF it IS NOT NULL THEN
    PERFORM add_contact(p_bid, 'email', it->>'email', 'facebook');
    PERFORM add_contact(p_bid, 'phone', it->>'phone', 'facebook');
  END IF;
END $$;

-- Enrich (workflow 04): dùng helper + ghi chi phí ước tính
CREATE OR REPLACE FUNCTION save_facebook(p_sent jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; v_found int := 0; v_job bigint; v_sent int := jsonb_array_length(p_sent);
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Apify response is not an array: %', left(p_items::text, 300);
  END IF;

  FOR r IN
    SELECT (s->>'id')::bigint AS bid, s->>'url' AS url, m.it
    FROM jsonb_array_elements(p_sent) s
    LEFT JOIN LATERAL (
      SELECT x AS it FROM jsonb_array_elements(p_items) x
      WHERE x->>'error' IS NULL
        AND fb_key(s->>'url') IN (fb_key(x->>'facebookUrl'), fb_key(x->>'pageUrl'), fb_key(x->>'inputUrl'))
      LIMIT 1
    ) m ON true
  LOOP
    IF r.it IS NOT NULL THEN v_found := v_found + 1; END IF;
    PERFORM upsert_fb_page(r.bid, r.url, r.it);
  END LOOP;

  INSERT INTO crawl_jobs (source, status, max_places, found, new_leads, cost_usd, finished_at)
  VALUES ('apify_fb_enrich', 'done', v_sent, v_found, 0,
          v_sent * setting_num('fb_enrich_cost_per_page'), now())
  RETURNING id INTO v_job;

  PERFORM rescore();
  RETURN jsonb_build_object('job_id', v_job, 'sent', v_sent, 'found', v_found);
END $$;

-- ---------------------------------------------------------------------
-- Nhận kết quả apify/facebook-search-scraper cho 1 job → tạo lead mới / gộp lead trùng
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ingest_facebook_search(p_job_id bigint, p_items jsonb, p_cost numeric)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  it jsonb; v_url text; v_key text; v_id bigint; v_phone text; v_web text;
  v_found int := 0; v_new int := 0; v_job crawl_jobs; v_area text;
BEGIN
  SELECT * INTO v_job FROM crawl_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'crawl_job % not found', p_job_id; END IF;
  SELECT name INTO v_area FROM locations WHERE id = v_job.location_id;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Apify response is not an array: %', left(p_items::text, 300);
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_url := coalesce(nullif(it->>'pageUrl', ''), it->>'facebookUrl');
    CONTINUE WHEN it->>'error' IS NOT NULL OR coalesce(v_url, '') = '';
    v_key   := fb_key(v_url);
    v_phone := normalize_phone(it->>'phone');
    v_web   := coalesce(it->>'website', (SELECT w FROM jarr(it->'websites') w LIMIT 1));
    v_found := v_found + 1;
    v_id    := NULL;

    -- Gộp với lead đã có: cùng fanpage, hoặc cùng SĐT (không tính tổng đài)
    SELECT x.id INTO v_id FROM (
      SELECT b.id, 1 AS p FROM businesses b WHERE b.place_id = 'fb:' || v_key
      UNION ALL
      SELECT c.business_id, 2 FROM contacts c
        WHERE c.type = 'facebook' AND fb_key(c.value_normalized) = v_key
      UNION ALL
      SELECT c.business_id, 3 FROM contacts c
        WHERE v_phone IS NOT NULL AND c.type = 'phone' AND NOT c.is_hotline AND c.value_normalized = v_phone
    ) x ORDER BY x.p LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO businesses (place_id, name, category, categories, industry_id, search_area,
                              address, rating, review_count, website_url, website_type,
                              source, last_job_id, raw)
      VALUES ('fb:' || v_key,
              coalesce(it->>'title', it->>'pageName', '(không tên)'),
              (SELECT c FROM jarr(it->'categories') c LIMIT 1),
              ARRAY(SELECT jarr(it->'categories')),
              v_job.industry_id, v_area,
              it->>'address',
              CASE WHEN it->>'ratingOverall' ~ '^\d+(\.\d+)?$' THEN (it->>'ratingOverall')::numeric END,
              coalesce(to_int(it->>'ratingCount'), 0),
              nullif(v_web, ''),
              classify_website(v_web),
              'apify_facebook', p_job_id, it)
      RETURNING id INTO v_id;
      v_new := v_new + 1;
    END IF;

    PERFORM add_contact(v_id, 'facebook', v_url, 'facebook');
    PERFORM upsert_fb_page(v_id, v_url, it);
  END LOOP;

  UPDATE crawl_jobs
     SET status = 'done', found = v_found, new_leads = v_new, cost_usd = p_cost, finished_at = now()
   WHERE id = p_job_id;

  PERFORM rescore();
  RETURN jsonb_build_object('job_id', p_job_id, 'found', v_found, 'new_leads', v_new, 'cost_usd', p_cost);
END $$;

-- Xem nhanh mục tiêu đêm nay + ngân sách còn lại
CREATE OR REPLACE VIEW v_run_plan AS
SELECT t.*, round(fb_spent_this_month(), 2) AS fb_spent_this_month_usd,
       (SELECT string_agg(keyword, ', ' ORDER BY priority DESC) FROM industries WHERE active) AS active_industries,
       (SELECT string_agg(name, ', ') FROM locations WHERE active) AS active_locations
FROM run_targets() t;
