-- =====================================================================
-- Ảnh thật của shop (Google Maps / fanpage) + công tắc tab generic + kiểm duyệt ảnh stock
-- Idempotent.
-- =====================================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS photo_url text;   -- ảnh đại diện thật của shop (cache)

INSERT INTO settings (key, value, description) VALUES
  ('outreach_generic_track', 'fallback', 'Tab "Template generic": fallback = chỉ chạy khi tab LLM hỏng hoàn toàn (tiết kiệm token) | on = luôn chạy | off = tắt'),
  ('outreach_image_check',   'true',     'Dùng MiMo (đọc ảnh) để duyệt ảnh stock trước khi chèn vào demo: true/false'),
  ('outreach_image_min_fit', '60',       'Ảnh stock phải đạt độ phù hợp từ mức này (0–100) mới được dùng')
ON CONFLICT (key) DO NOTHING;

-- Ảnh có sẵn trong dữ liệu crawl: gosom (thumbnail), Apify Maps (imageUrl), Facebook (ảnh bìa)
UPDATE businesses b SET photo_url = coalesce(
    nullif(b.raw->>'thumbnail', ''), nullif(b.raw->>'imageUrl', ''),
    (SELECT nullif(f.raw->>'coverPhotoUrl', '') FROM facebook_pages f WHERE f.business_id = b.id))
WHERE b.photo_url IS NULL;

-- Danh sách ảnh stock cũ chưa có ảnh thu nhỏ để duyệt → xoá để tìm lại
DELETE FROM image_cache WHERE provider = 'photo';
