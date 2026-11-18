-- =====================================================================
-- Chuyển Facebook search sang searchType = 'pages-google'
-- (test thật 18/11: 'pages' trả về toàn trang lạc đề và không có SĐT/email;
--  'pages-google' trả đúng ngành và đủ liên hệ, giá $0.012/kết quả)
-- + phân loại link rút gọn / bài báo không phải website riêng
-- Idempotent.
-- =====================================================================

UPDATE settings
   SET value = '0.012',
       description = 'Giá apify/facebook-search-scraper (searchType pages-google) mỗi kết quả, gói Free'
 WHERE key = 'fb_search_cost_per_result';

CREATE OR REPLACE FUNCTION classify_website(url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(trim(url), '') = '' THEN 'none'
    -- Bài báo / trang tin: không phải website của doanh nghiệp
    WHEN url ~* '(vnexpress\.net|dantri\.com\.vn|tuoitre\.vn|thanhnien\.vn|kenh14\.vn|24h\.com\.vn|zingnews\.vn|znews\.vn|vietnamnet\.vn|cafef\.vn|cafebiz\.vn|baomoi\.com)'
      THEN 'none'
    WHEN url ~* '(facebook\.com|fb\.com|fb\.me|instagram\.com|tiktok\.com|zalo\.me|linktr\.ee|youtube\.com|youtu\.be|linkedin\.com|t\.me/|bio\.link|beacons\.ai|twitter\.com|//x\.com|bit\.ly|tinyurl\.com|goo\.gl|rebrand\.ly|cutt\.ly|s\.id/|forms\.gle|docs\.google\.com/forms)'
      THEN 'social'
    WHEN url ~* '(shopee\.|lazada\.|tiki\.vn|sendo\.vn|grab\.com|foody\.vn|shopeefood)'
      THEN 'marketplace'
    WHEN url ~* '(sites\.google\.com|business\.site|blogspot\.|wixsite\.com|weebly\.com|webflow\.io|my\.canva\.site|ladi\.me|wordpress\.com)'
      THEN 'freebuilder'
    ELSE 'real'
  END
$$;

-- Ghi 1 fanpage: chấp nhận cả 2 kiểu output (title/pageUrl/pageId hoặc name/url/id)
CREATE OR REPLACE FUNCTION upsert_fb_page(p_bid bigint, p_url text, it jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO facebook_pages AS f (business_id, page_url, page_name, page_id, categories,
      followers, likes, email, phone, website, rating, creation_date, ad_status,
      is_running_ads, intro, found, raw, scraped_at)
  VALUES (p_bid, p_url,
      coalesce(it->>'title', it->>'pageName', it->>'name'),
      coalesce(it->>'pageId', it->>'facebookId', it->>'id'),
      CASE WHEN jsonb_typeof(it->'categories') = 'array'
           THEN (SELECT string_agg(c, ', ') FROM jarr(it->'categories') c)
           ELSE it->>'category' END,
      to_int(it->>'followers'),
      to_int(it->>'likes'),
      it->>'email',
      it->>'phone',
      coalesce(it->>'website', (SELECT w FROM jarr(it->'websites') w LIMIT 1)),
      coalesce(it->>'rating', it->>'ratingOverall'),
      it->>'creation_date',
      it->>'ad_status',
      CASE WHEN it->>'ad_status' IS NULL THEN NULL
           ELSE (it->>'ad_status') !~* '(not currently|isn''t currently|is not currently|không)' END,
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
    -- Link của page: pageUrl / url; facebookUrl chỉ dùng khi không phải link trang tìm kiếm
    v_url := coalesce(nullif(it->>'pageUrl', ''), nullif(it->>'url', ''),
                      CASE WHEN it->>'facebookUrl' !~* '/search/' THEN nullif(it->>'facebookUrl', '') END);
    CONTINUE WHEN it->>'error' IS NOT NULL OR v_url IS NULL;
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
              -- Google trả tiêu đề dạng "Tên page | Ho Chi Minh City" → bỏ đuôi thành phố
              regexp_replace(coalesce(it->>'title', it->>'pageName', it->>'name', '(không tên)'),
                             '\s*\|\s*[^|]*(City|Hanoi|Hà Nội|Hồ Chí Minh|Vietnam|Việt Nam)\s*$', '', 'i'),
              coalesce((SELECT c FROM jarr(it->'categories') c LIMIT 1), it->>'category'),
              ARRAY(SELECT jarr(it->'categories')),
              v_job.industry_id, v_area,
              it->>'address',
              -- Facebook: ratingOverall = % người giới thiệu (0–100) → quy về thang 5 sao như Google
              CASE WHEN it->>'ratingOverall' ~ '^\d+(\.\d+)?$'
                   THEN round(least((it->>'ratingOverall')::numeric, 100) / 20, 1) END,
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

-- Bỏ đuôi " | <thành phố>" khỏi tên lead Facebook đã có
UPDATE businesses
   SET name = regexp_replace(name, '\s*\|\s*[^|]*(City|Hanoi|Hà Nội|Hồ Chí Minh|Vietnam|Việt Nam)\s*$', '', 'i')
 WHERE source = 'apify_facebook' AND name ~ '\|';

-- Phân loại lại website của lead đã có theo luật mới
UPDATE businesses SET website_type = classify_website(website_url)
 WHERE website_type IS DISTINCT FROM classify_website(website_url);
SELECT rescore();
