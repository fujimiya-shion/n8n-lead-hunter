-- Hàng đợi tạo demo lưu trong DB (máy reboot / studio restart không mất danh sách chờ; lead đang chạy dở được chạy lại)
CREATE TABLE IF NOT EXISTS generate_queue (
  id           bigserial PRIMARY KEY,
  business_id  bigint NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status       text   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  outreach_id  bigint,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS generate_queue_status_idx ON generate_queue (status, id);

-- Bỏ tab "template generic" (thư viện section dựng sẵn): không còn dùng
ALTER TABLE outreach DROP COLUMN IF EXISTS pages;
DELETE FROM settings WHERE key = 'outreach_generic_track';
UPDATE settings SET description = 'Số lời gọi LLM viết HTML chạy song song khi tạo 1 bộ demo' WHERE key = 'outreach_llm_concurrency';
INSERT INTO settings (key, value, description) VALUES
  ('outreach_parallel_leads', '5', 'Số lead tạo demo song song cùng lúc (mỗi lead lại gọi LLM song song theo outreach_llm_concurrency). Gặp lỗi 429 (quá giới hạn LLM) thì giảm xuống')
ON CONFLICT (key) DO NOTHING;
