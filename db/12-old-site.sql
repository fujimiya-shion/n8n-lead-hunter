-- Lead có website cũ còn sống: fetch HTML → làm gọn → LLM phân tích 1 lần → dùng để làm bản "làm mới" website cũ
CREATE TABLE IF NOT EXISTS site_snapshots (
  id            bigserial PRIMARY KEY,
  business_id   bigint NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  url           text   NOT NULL,
  via           text,              -- fetch | chromium
  compact_chars integer,           -- độ dài HTML đã làm gọn gửi cho LLM
  analysis      jsonb,             -- nội dung thật + bố cục + điểm yếu + ảnh thật
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_snapshots_biz_idx ON site_snapshots (business_id, fetched_at DESC);

INSERT INTO settings (key, value, description) VALUES
  ('outreach_old_site', 'true', 'Lead có website cũ còn sống: lấy HTML web cũ làm nền để gen bản làm mới (true/false)')
ON CONFLICT (key) DO NOTHING;
