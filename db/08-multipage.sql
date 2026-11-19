-- =====================================================================
-- Demo nhiều trang: kế hoạch site + nội dung từng trang + danh sách ảnh chụp; cache ảnh/minh hoạ
-- Idempotent.
-- =====================================================================

ALTER TABLE outreach ADD COLUMN IF NOT EXISTS site_plan jsonb;   -- trang nào, phong cách, section, màu, font
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS pages     jsonb;   -- nội dung JSON từng trang (dựng lại không cần LLM)
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS shots     jsonb;   -- [{page, title, kind: full|mobile|section, section, label, file, w, h}]

CREATE TABLE IF NOT EXISTS image_cache (
  provider   text NOT NULL,          -- photo (Pexels/Unsplash) | iconify
  query      text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, query)
);

INSERT INTO settings (key, value, description) VALUES
  ('outreach_max_pages', '4', 'Số trang tối đa trong mỗi bộ demo (LLM tự chọn trang nào, tối thiểu 2)')
ON CONFLICT (key) DO NOTHING;

-- Mỗi lead giờ tốn 4–6 lượt gọi LLM → giảm mặc định số lead mỗi lượt (chỉ khi còn giá trị cũ)
UPDATE settings SET value = '5' WHERE key = 'outreach_per_run' AND value = '10';
