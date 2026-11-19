-- =====================================================================
-- Tab "LLM tự thiết kế": lưu HTML gốc do LLM viết cho từng màn hình (dựng/chụp lại không cần gọi LLM)
-- Idempotent.
-- =====================================================================
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS llm_pages jsonb;   -- [{slug, title, kind: page|section|modal, html, truncated}]

INSERT INTO settings (key, value, description) VALUES
  ('outreach_llm_concurrency', '4', 'Số lời gọi LLM chạy song song khi tạo 1 bộ demo (HTML + nội dung template)')
ON CONFLICT (key) DO NOTHING;
