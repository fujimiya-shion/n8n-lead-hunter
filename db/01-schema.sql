-- =====================================================================
-- Lead Hunter schema (DB: leads)
-- Toàn bộ logic chuẩn hoá / chống trùng / chấm điểm nằm ở đây để
-- workflow n8n chỉ việc gọi hàm: plan_crawl_jobs, ingest_places,
-- save_audit, rescore.
-- =====================================================================

-- ---------- Danh mục ngành & khu vực ----------
CREATE TABLE industries (
  id         serial PRIMARY KEY,
  keyword    text NOT NULL UNIQUE,          -- từ khoá tìm trên Google Maps
  priority   int  NOT NULL DEFAULT 1,       -- 1 thường, 2 ưu tiên, 3 rất ưu tiên
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE locations (
  id         serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,          -- nhãn hiển thị, vd "Quận 7"
  query      text NOT NULL,                 -- chuỗi gửi cho Apify, vd "Quận 7, Hồ Chí Minh, Vietnam"
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE crawl_jobs (
  id           bigserial PRIMARY KEY,
  industry_id  int REFERENCES industries(id),
  location_id  int REFERENCES locations(id),
  source       text NOT NULL DEFAULT 'gosom_maps',   -- gosom_maps | apify_maps | apify_facebook
  external_id  text,                                 -- id job bên gosom/Apify
  status       text NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','done','failed')),
  max_places   int,
  found        int,
  new_leads    int,
  error        text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX ON crawl_jobs (industry_id, location_id, started_at DESC);

-- ---------- Lead ----------
CREATE TYPE lead_status AS ENUM
  ('new','to_contact','contacted','interested','won','lost','skip');

CREATE TABLE businesses (
  id             bigserial PRIMARY KEY,
  place_id       text NOT NULL UNIQUE,      -- Google placeId, khoá chống trùng
  name           text NOT NULL,
  -- ===== phần bạn làm việc hằng ngày (NocoDB) =====
  status         lead_status NOT NULL DEFAULT 'new',
  note           text,
  contacted_at   timestamptz,
  next_call_at   timestamptz,                -- hẹn gọi lại (view Lịch trong NocoDB)
  -- ===== tự tính bởi rescore() =====
  industry_name  text,                       -- tên ngành (để nhóm trong NocoDB)
  score          int NOT NULL DEFAULT 0,
  score_reasons  text,
  phone          text,                      -- SĐT gọi được (dạng 0xxx), không phải 1900/1800
  hotline        text,
  emails         text,
  facebook_url   text,
  -- ===== dữ liệu crawl =====
  website_url    text,
  website_type   text NOT NULL DEFAULT 'none'
                 CHECK (website_type IN ('none','social','marketplace','freebuilder','real')),
  category       text,
  categories     text[],
  industry_id    int REFERENCES industries(id),
  search_area    text,                      -- khu vực của job tìm ra lead
  address        text,
  ward           text,
  city           text,
  lat            double precision,
  lng            double precision,
  rating         numeric(2,1),
  review_count   int NOT NULL DEFAULT 0,
  maps_url       text,
  source         text NOT NULL DEFAULT 'gosom_maps',
  last_job_id    bigint REFERENCES crawl_jobs(id),
  raw            jsonb,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON businesses (status, score DESC);
CREATE INDEX ON businesses (industry_id);
CREATE INDEX ON businesses (first_seen_at);

CREATE TABLE contacts (
  id               bigserial PRIMARY KEY,
  business_id      bigint NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('phone','email','facebook','instagram','tiktok','zalo')),
  value_normalized text NOT NULL,
  is_hotline       boolean NOT NULL DEFAULT false,
  source           text NOT NULL,           -- maps | maps_contacts | website | facebook
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, type, value_normalized)
);
CREATE INDEX ON contacts (type, value_normalized);

CREATE TABLE web_audit (
  business_id        bigint PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  reachable          boolean,
  status_code        int,
  has_ssl            boolean,
  is_mobile_friendly boolean,
  copyright_year     int,
  cms                text,
  page_title         text,
  error              text,
  audited_at         timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- Hàm tiện ích
-- =====================================================================

-- Chuẩn hoá SĐT VN về +84xxxxxxxxx; tổng đài 1900/1800 giữ nguyên
CREATE OR REPLACE FUNCTION normalize_phone(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN d ~ '^84(1900|1800)\d{4,6}$' THEN substr(d, 3)
    WHEN d ~ '^(1900|1800)\d{4,6}$'    THEN d
    WHEN d ~ '^84\d{9,10}$'            THEN '+' || d
    WHEN d ~ '^0\d{9,10}$'             THEN '+84' || substr(d, 2)
    ELSE NULL
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) s
$$;

-- +84xxxxxxxxx -> 0xxxxxxxxx cho dễ bấm gọi
CREATE OR REPLACE FUNCTION phone_display(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p LIKE '+84%' THEN '0' || substr(p, 4) ELSE p END
$$;

-- Phân loại "website" lấy từ Google Maps
CREATE OR REPLACE FUNCTION classify_website(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(trim(url), '') = '' THEN 'none'
    WHEN url ~* '(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|zalo\.me|linktr\.ee|youtube\.com|youtu\.be|linkedin\.com|t\.me/|bio\.link|beacons\.ai|twitter\.com|//x\.com)'
      THEN 'social'
    WHEN url ~* '(shopee\.|lazada\.|tiki\.vn|sendo\.vn|grab\.com|foody\.vn|shopeefood)'
      THEN 'marketplace'
    WHEN url ~* '(sites\.google\.com|business\.site|blogspot\.|wixsite\.com|weebly\.com|webflow\.io|my\.canva\.site|ladi\.me|wordpress\.com)'
      THEN 'freebuilder'
    ELSE 'real'
  END
$$;

-- Lấy phần tử text của 1 mảng JSON (an toàn khi null / không phải mảng)
CREATE OR REPLACE FUNCTION jarr(j jsonb) RETURNS SETOF text
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(j) = 'array' THEN j ELSE '[]'::jsonb END)
$$;

-- Thêm 1 liên hệ (tự chuẩn hoá + lọc rác). Trả về true nếu hợp lệ.
CREATE OR REPLACE FUNCTION add_contact(p_bid bigint, p_type text, p_raw text, p_source text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v text; v_hot boolean := false;
BEGIN
  IF p_raw IS NULL OR trim(p_raw) = '' THEN RETURN false; END IF;

  IF p_type = 'phone' THEN
    v := normalize_phone(p_raw);
    v_hot := v ~ '^(1900|1800)';
  ELSIF p_type = 'email' THEN
    v := lower(trim(both ' .' FROM regexp_replace(p_raw, '^mailto:', '', 'i')));
    IF v !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
       OR v ~ '\.(png|jpe?g|gif|webp|svg|css|js)$'
       OR v ~ '(example\.|sentry|wixpress|noreply|no-reply|domain\.com|email\.com|yourmail|yourdomain|yourname|addresshere|enteryour|@2x|u00)'
    THEN v := NULL; END IF;
  ELSE
    v := regexp_replace(regexp_replace(p_raw, '\s', '', 'g'), '[/?#]+$', '');
    IF v !~* '^https?://' THEN v := NULL; END IF;
  END IF;

  IF v IS NULL THEN RETURN false; END IF;

  INSERT INTO contacts (business_id, type, value_normalized, is_hotline, source)
  VALUES (p_bid, p_type, v, v_hot, p_source)
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

-- =====================================================================
-- 1) Lên danh sách job crawl: cặp ngành × khu vực chưa crawl trong 30 ngày
-- =====================================================================
CREATE OR REPLACE FUNCTION plan_crawl_jobs(p_limit int DEFAULT 5, p_max_places int DEFAULT 30, p_source text DEFAULT 'gosom_maps')
RETURNS TABLE (job_id bigint, keyword text, location_query text, max_places int)
LANGUAGE plpgsql AS $$
BEGIN
  -- job "running" quá 3 giờ coi như hỏng
  UPDATE crawl_jobs SET status = 'failed', error = 'stale', finished_at = now()
  WHERE status = 'running' AND started_at < now() - interval '3 hours';

  RETURN QUERY
  WITH picked AS (
    SELECT i.id AS iid, l.id AS lid
    FROM industries i CROSS JOIN locations l
    WHERE i.active AND l.active
      AND NOT EXISTS (
        SELECT 1 FROM crawl_jobs j
        WHERE j.industry_id = i.id AND j.location_id = l.id
          AND (j.status = 'running'
               OR (j.status = 'done' AND j.started_at > now() - interval '30 days'))
      )
    ORDER BY i.priority DESC, random()
    LIMIT p_limit
  ), ins AS (
    INSERT INTO crawl_jobs (industry_id, location_id, max_places, source)
    SELECT iid, lid, p_max_places, p_source FROM picked
    RETURNING id, industry_id, location_id, crawl_jobs.max_places
  )
  SELECT ins.id, i.keyword, l.query, ins.max_places
  FROM ins JOIN industries i ON i.id = ins.industry_id
           JOIN locations  l ON l.id = ins.location_id;
END $$;

-- =====================================================================
-- 2) Nhận kết quả Apify Google Maps Scraper (mảng JSON) cho 1 job
-- =====================================================================
CREATE OR REPLACE FUNCTION ingest_places(p_job_id bigint, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  it jsonb; s text; v_id bigint; v_new boolean;
  v_found int := 0; v_newc int := 0;
  v_job crawl_jobs; v_area text;
BEGIN
  SELECT * INTO v_job FROM crawl_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'crawl_job % not found', p_job_id; END IF;
  SELECT name INTO v_area FROM locations WHERE id = v_job.location_id;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Apify response is not an array: %', left(p_items::text, 300);
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN coalesce(it->>'placeId', '') = ''
               OR coalesce((it->>'permanentlyClosed')::boolean, false);
    v_found := v_found + 1;

    INSERT INTO businesses AS b (
      place_id, name, category, categories, industry_id, search_area,
      address, ward, city, lat, lng, rating, review_count,
      website_url, website_type, maps_url, source, last_job_id, raw)
    VALUES (
      it->>'placeId',
      coalesce(it->>'title', '(không tên)'),
      it->>'categoryName',
      ARRAY(SELECT jarr(it->'categories')),
      v_job.industry_id,
      v_area,
      it->>'address',
      it->>'state',
      it->>'city',
      (it->'location'->>'lat')::double precision,
      (it->'location'->>'lng')::double precision,
      (it->>'totalScore')::numeric,
      coalesce((it->>'reviewsCount')::int, 0),
      nullif(it->>'website', ''),
      classify_website(it->>'website'),
      it->>'url',
      v_job.source,
      p_job_id,
      it)
    ON CONFLICT (place_id) DO UPDATE SET
      name         = EXCLUDED.name,
      category     = EXCLUDED.category,
      categories   = EXCLUDED.categories,
      industry_id  = coalesce(b.industry_id, EXCLUDED.industry_id),
      address      = EXCLUDED.address,
      ward         = EXCLUDED.ward,
      city         = EXCLUDED.city,
      lat          = EXCLUDED.lat,
      lng          = EXCLUDED.lng,
      rating       = EXCLUDED.rating,
      review_count = EXCLUDED.review_count,
      website_url  = EXCLUDED.website_url,
      website_type = EXCLUDED.website_type,
      maps_url     = EXCLUDED.maps_url,
      last_job_id  = EXCLUDED.last_job_id,
      raw          = EXCLUDED.raw,
      updated_at   = now()
    RETURNING id, (xmax = 0) INTO v_id, v_new;

    IF v_new THEN v_newc := v_newc + 1; END IF;

    PERFORM add_contact(v_id, 'phone', coalesce(it->>'phoneUnformatted', it->>'phone'), 'maps');
    FOR s IN SELECT jarr(it->'phones')     LOOP PERFORM add_contact(v_id, 'phone',     s, 'maps_contacts'); END LOOP;
    FOR s IN SELECT jarr(it->'emails')     LOOP PERFORM add_contact(v_id, 'email',     s, 'maps_contacts'); END LOOP;
    FOR s IN SELECT jarr(it->'facebooks')  LOOP PERFORM add_contact(v_id, 'facebook',  s, 'maps_contacts'); END LOOP;
    FOR s IN SELECT jarr(it->'instagrams') LOOP PERFORM add_contact(v_id, 'instagram', s, 'maps_contacts'); END LOOP;
    FOR s IN SELECT jarr(it->'tiktoks')    LOOP PERFORM add_contact(v_id, 'tiktok',    s, 'maps_contacts'); END LOOP;
    -- website chính là fanpage -> lưu luôn làm liên hệ facebook
    IF it->>'website' ~* 'facebook\.com' THEN
      PERFORM add_contact(v_id, 'facebook', it->>'website', 'maps');
    END IF;
  END LOOP;

  UPDATE crawl_jobs
     SET status = 'done', found = v_found, new_leads = v_newc, finished_at = now()
   WHERE id = p_job_id;

  PERFORM rescore();
  RETURN jsonb_build_object('job_id', p_job_id, 'found', v_found, 'new_leads', v_newc);
END $$;

CREATE OR REPLACE FUNCTION fail_crawl_job(p_job_id bigint, p_error text)
RETURNS void LANGUAGE sql AS $$
  UPDATE crawl_jobs SET status = 'failed', error = left(p_error, 2000), finished_at = now()
  WHERE id = p_job_id AND status = 'running';
$$;

-- =====================================================================
-- 3) Lưu kết quả audit website (do workflow n8n phân tích HTML)
-- =====================================================================
CREATE OR REPLACE FUNCTION save_audit(p_bid bigint, a jsonb)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE s text;
BEGIN
  INSERT INTO web_audit AS w (business_id, reachable, status_code, has_ssl, is_mobile_friendly,
                              copyright_year, cms, page_title, error, audited_at)
  VALUES (p_bid,
          (a->>'reachable')::boolean,
          (a->>'status_code')::int,
          (a->>'has_ssl')::boolean,
          (a->>'is_mobile_friendly')::boolean,
          (a->>'copyright_year')::int,
          a->>'cms',
          left(a->>'page_title', 300),
          left(a->>'error', 1000),
          now())
  ON CONFLICT (business_id) DO UPDATE SET
    reachable = EXCLUDED.reachable, status_code = EXCLUDED.status_code,
    has_ssl = EXCLUDED.has_ssl, is_mobile_friendly = EXCLUDED.is_mobile_friendly,
    copyright_year = EXCLUDED.copyright_year, cms = EXCLUDED.cms,
    page_title = EXCLUDED.page_title, error = EXCLUDED.error, audited_at = now();

  FOR s IN SELECT jarr(a->'emails')    LOOP PERFORM add_contact(p_bid, 'email',    s, 'website'); END LOOP;
  FOR s IN SELECT jarr(a->'phones')    LOOP PERFORM add_contact(p_bid, 'phone',    s, 'website'); END LOOP;
  FOR s IN SELECT jarr(a->'facebooks') LOOP PERFORM add_contact(p_bid, 'facebook', s, 'website'); END LOOP;
  FOR s IN SELECT jarr(a->'zalos')     LOOP PERFORM add_contact(p_bid, 'zalo',     s, 'website'); END LOOP;
END $$;

-- =====================================================================
-- Facebook (Apify facebook-pages-scraper): enrich lead đã có fanpage
-- =====================================================================
CREATE TABLE facebook_pages (
  business_id     bigint PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  page_url        text NOT NULL,
  page_name       text,
  page_id         text,
  categories      text,
  followers       int,
  likes           int,
  email           text,
  phone           text,
  website         text,
  rating          text,
  creation_date   text,
  ad_status       text,
  is_running_ads  boolean,
  intro           text,
  found           boolean NOT NULL DEFAULT true,   -- false = Apify không trả dữ liệu cho page này
  raw             jsonb,
  scraped_at      timestamptz NOT NULL DEFAULT now()
);

-- Khoá so khớp URL fanpage (bỏ http, www/m, query, dấu / cuối; giữ profile.php?id=)
CREATE OR REPLACE FUNCTION fb_key(u text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN u IS NULL THEN NULL
    WHEN u ~* 'profile\.php\?id=\d+' THEN 'id:' || (regexp_match(u, 'id=(\d+)'))[1]
    ELSE lower(regexp_replace(regexp_replace(regexp_replace(trim(u),
           '^https?://([a-z-]+\.)?(facebook|fb)\.com/', '', 'i'), '[?#].*$', ''), '/+$', ''))
  END
$$;

CREATE OR REPLACE FUNCTION to_int(t text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '')::bigint::int
$$;

-- p_sent:  [{"id": business_id, "url": "..."}]  (những page đã gửi cho Apify)
-- p_items: mảng kết quả của actor
CREATE OR REPLACE FUNCTION save_facebook(p_sent jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r record; v_found int := 0; v_job bigint;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Apify response is not an array: %', left(p_items::text, 300);
  END IF;

  FOR r IN
    SELECT (s->>'id')::bigint AS bid, s->>'url' AS url, it
    FROM jsonb_array_elements(p_sent) s
    LEFT JOIN LATERAL (
      SELECT x AS it FROM jsonb_array_elements(p_items) x
      WHERE x->>'error' IS NULL
        AND fb_key(s->>'url') IN (fb_key(x->>'facebookUrl'), fb_key(x->>'pageUrl'), fb_key(x->>'inputUrl'))
      LIMIT 1
    ) m ON true
  LOOP
    IF r.it IS NOT NULL THEN v_found := v_found + 1; END IF;

    INSERT INTO facebook_pages AS f (business_id, page_url, page_name, page_id, categories,
        followers, likes, email, phone, website, rating, creation_date, ad_status,
        is_running_ads, intro, found, raw, scraped_at)
    VALUES (r.bid, r.url,
        coalesce(r.it->>'title', r.it->>'pageName'),
        coalesce(r.it->>'pageId', r.it->>'facebookId'),
        CASE WHEN jsonb_typeof(r.it->'categories') = 'array'
             THEN (SELECT string_agg(c, ', ') FROM jarr(r.it->'categories') c) END,
        to_int(r.it->>'followers'),
        to_int(r.it->>'likes'),
        r.it->>'email',
        r.it->>'phone',
        coalesce(r.it->>'website', (SELECT w FROM jarr(r.it->'websites') w LIMIT 1)),
        coalesce(r.it->>'rating', r.it->>'ratingOverall'),
        r.it->>'creation_date',
        r.it->>'ad_status',
        CASE WHEN r.it->>'ad_status' IS NULL THEN NULL
             ELSE (r.it->>'ad_status') !~* '(not currently|không)' END,
        left(r.it->>'intro', 1000),
        r.it IS NOT NULL,
        r.it,
        now())
    ON CONFLICT (business_id) DO UPDATE SET
      page_url = EXCLUDED.page_url, page_name = EXCLUDED.page_name, page_id = EXCLUDED.page_id,
      categories = EXCLUDED.categories, followers = EXCLUDED.followers, likes = EXCLUDED.likes,
      email = EXCLUDED.email, phone = EXCLUDED.phone, website = EXCLUDED.website,
      rating = EXCLUDED.rating, creation_date = EXCLUDED.creation_date,
      ad_status = EXCLUDED.ad_status, is_running_ads = EXCLUDED.is_running_ads,
      intro = EXCLUDED.intro, found = EXCLUDED.found, raw = EXCLUDED.raw, scraped_at = now();

    IF r.it IS NOT NULL THEN
      PERFORM add_contact(r.bid, 'email', r.it->>'email', 'facebook');
      PERFORM add_contact(r.bid, 'phone', r.it->>'phone', 'facebook');
    END IF;
  END LOOP;

  INSERT INTO crawl_jobs (source, status, found, new_leads, finished_at)
  VALUES ('apify_facebook', 'done', v_found, 0, now()) RETURNING id INTO v_job;

  PERFORM rescore();
  RETURN jsonb_build_object('job_id', v_job, 'sent', jsonb_array_length(p_sent), 'found', v_found);
END $$;

-- =====================================================================
-- 4) Chấm điểm + đổ dữ liệu hiển thị vào bảng businesses
--    Điểm = tổng các số "(+N)" / "(-N)" trong lý do -> sửa công thức tại 1 chỗ.
-- =====================================================================
CREATE OR REPLACE FUNCTION rescore() RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  WITH c AS (
    SELECT business_id,
      (array_agg(value_normalized ORDER BY (source = 'maps') DESC, id)
         FILTER (WHERE type = 'phone' AND NOT is_hotline))[1]                 AS phone,
      (array_agg(value_normalized ORDER BY id)
         FILTER (WHERE type = 'phone' AND is_hotline))[1]                     AS hotline,
      string_agg(DISTINCT value_normalized, ', ') FILTER (WHERE type = 'email') AS emails,
      (array_agg(value_normalized ORDER BY id) FILTER (WHERE type = 'facebook'))[1] AS fb
    FROM contacts GROUP BY business_id
  ), r AS (
    SELECT b.id, c.phone, c.hotline, c.emails, c.fb, i.keyword AS industry_kw,
      array_remove(ARRAY[
        CASE b.website_type
          WHEN 'none'        THEN 'Chưa có website (+40)'
          WHEN 'social'      THEN 'Website chỉ là mạng xã hội (+30)'
          WHEN 'marketplace' THEN 'Website chỉ là sàn TMĐT (+30)'
          WHEN 'freebuilder' THEN 'Web dựng bằng công cụ miễn phí (+20)'
        END,
        CASE WHEN b.website_type = 'real' AND a.reachable = false THEN 'Website không truy cập được (+30)' END,
        CASE WHEN a.reachable AND a.has_ssl = false            THEN 'Không có SSL (+15)' END,
        CASE WHEN a.reachable AND a.is_mobile_friendly = false THEN 'Không responsive (+15)' END,
        CASE WHEN a.copyright_year < 2021 THEN 'Copyright cũ ' || a.copyright_year || ' (+10)' END,
        CASE WHEN b.review_count >= 50   THEN b.review_count || ' review (+10)' END,
        CASE WHEN b.rating >= 4.3        THEN 'Rating ' || b.rating || '★ (+10)' END,
        CASE WHEN c.phone IS NOT NULL    THEN 'Có SĐT gọi được (+10)' END,
        CASE WHEN c.emails IS NOT NULL   THEN 'Có email (+5)' END,
        CASE WHEN i.priority >= 2        THEN 'Ngành ưu tiên (+10)' END,
        CASE WHEN f.is_running_ads       THEN 'Fanpage đang chạy quảng cáo (+15)' END,
        CASE WHEN f.followers >= 1000    THEN 'Fanpage ' || f.followers || ' follower (+10)' END,
        CASE WHEN b.website_type IN ('none','social') AND classify_website(f.website) = 'real'
             THEN 'Fanpage có ghi website riêng: ' || f.website || ' (-20)' END
      ], NULL) AS reasons
    FROM businesses b
    LEFT JOIN c          ON c.business_id = b.id
    LEFT JOIN web_audit a ON a.business_id = b.id
    LEFT JOIN industries i ON i.id = b.industry_id
    LEFT JOIN facebook_pages f ON f.business_id = b.id
  ), s AS (
    SELECT r.*,
      (SELECT coalesce(sum((regexp_match(x, '\(([+-]\d+)\)'))[1]::int), 0) FROM unnest(r.reasons) x) AS score
    FROM r
  )
  UPDATE businesses b SET
    score         = s.score,
    industry_name = s.industry_kw,
    score_reasons = array_to_string(s.reasons, ' · '),
    phone         = phone_display(s.phone),
    hotline       = s.hotline,
    emails        = s.emails,
    facebook_url  = coalesce(s.fb, CASE WHEN b.website_url ~* '(facebook\.com|fb\.com|fb\.me)' THEN b.website_url END),
    status        = CASE WHEN b.status = 'new' AND s.score >= 60 THEN 'to_contact'::lead_status ELSE b.status END
  FROM s WHERE s.id = b.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Tự ghi thời điểm liên hệ khi bạn đổi status trong NocoDB
CREATE OR REPLACE FUNCTION trg_contacted_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('contacted','interested','won','lost')
     AND NEW.contacted_at IS NULL THEN
    NEW.contacted_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER businesses_contacted_at BEFORE UPDATE OF status ON businesses
FOR EACH ROW EXECUTE FUNCTION trg_contacted_at();

-- =====================================================================
-- View cho NocoDB / Metabase
-- =====================================================================
CREATE OR REPLACE VIEW v_leads AS
SELECT b.id, b.name, b.score, b.status, b.phone, b.hotline, b.emails,
       b.website_url, b.website_type, b.facebook_url,
       b.rating, b.review_count, b.category, i.keyword AS industry,
       b.search_area, b.ward, b.address, b.maps_url, b.score_reasons, b.note,
       b.contacted_at, b.first_seen_at, b.lat, b.lng,
       a.has_ssl, a.is_mobile_friendly, a.copyright_year, a.cms,
       f.followers AS fb_followers, f.is_running_ads AS fb_running_ads, f.creation_date AS fb_created
FROM businesses b
LEFT JOIN industries i ON i.id = b.industry_id
LEFT JOIN web_audit  a ON a.business_id = b.id
LEFT JOIN facebook_pages f ON f.business_id = b.id;
