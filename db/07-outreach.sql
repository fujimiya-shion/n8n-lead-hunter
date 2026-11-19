-- =====================================================================
-- Demo web + tin nhắn chào hàng do LLM tạo (service `studio`)
-- Việc GỬI tin do bạn tự làm; hệ thống chỉ chuẩn bị nội dung để duyệt.
-- Idempotent: áp lại lên DB đang chạy được.
-- =====================================================================

CREATE TABLE IF NOT EXISTS outreach (
  id               bigserial PRIMARY KEY,
  business_id      bigint NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'generating'
                   CHECK (status IN ('generating','draft','approved','sent','skipped','failed')),
  message          text,                 -- tin nhắn hiện tại (bạn có thể sửa)
  message_original text,                 -- bản LLM viết, để so với bản đã sửa
  demo_title       text,
  model            text,
  lead_score       int,
  human_score      int,                  -- 0–100: mức tự nhiên như người viết
  fit_score        int,                  -- 0–100: demo khớp ngành / tên shop
  confidence       int,                  -- 0–100: dùng để xếp hạng, KHÔNG dùng để tự gửi
  judge_issues     jsonb,
  tokens_in        int,
  tokens_out       int,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz,
  sent_at          timestamptz
);
-- Template dùng + nội dung JSON (để dựng lại demo mà không cần gọi LLM)
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS template     text;
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS demo_content jsonb;

-- Mỗi lead chỉ có 1 bản đang mở
CREATE UNIQUE INDEX IF NOT EXISTS outreach_open_per_lead
  ON outreach (business_id) WHERE status IN ('generating','draft','approved');
CREATE INDEX IF NOT EXISTS outreach_status_conf ON outreach (status, confidence DESC);

INSERT INTO settings (key, value, description) VALUES
  ('outreach_per_run',          '10',   'Số lead được tạo demo + tin nhắn mỗi lượt chạy'),
  ('outreach_min_lead_score',   '60',   'Chỉ tạo demo cho lead có điểm từ mức này trở lên'),
  ('outreach_ready_threshold',  '80',   'Confident từ mức này → gắn nhãn "Sẵn sàng" trên trang duyệt'),
  ('outreach_sender_name',      'Lợi',  'Tên bạn, dùng để ký tin nhắn chào hàng'),
  ('outreach_sender_intro',     'em làm website cho các shop và doanh nghiệp nhỏ', 'Một câu giới thiệu bạn là ai, LLM dùng khi viết tin nhắn')
ON CONFLICT (key) DO NOTHING;

-- Lead cần tạo demo: đang "cần gọi", có SĐT, đủ điểm, chưa từng có bản nháp (trừ bản lỗi)
CREATE OR REPLACE FUNCTION pick_outreach_leads(p_limit int)
RETURNS TABLE (business_id bigint)
LANGUAGE sql STABLE AS $$
  SELECT b.id FROM businesses b
  WHERE b.status = 'to_contact'
    AND b.phone IS NOT NULL
    AND b.score >= coalesce(setting_num('outreach_min_lead_score'), 60)
    AND NOT EXISTS (SELECT 1 FROM outreach o WHERE o.business_id = b.id AND o.status <> 'failed')
  ORDER BY b.score DESC, b.review_count DESC
  LIMIT p_limit
$$;

-- Thống kê cho Metabase
CREATE OR REPLACE VIEW a_outreach AS
SELECT o.id, o.business_id, o.status, o.confidence, o.human_score, o.fit_score, o.lead_score,
       o.message IS DISTINCT FROM o.message_original AS message_edited,
       o.model, o.tokens_in, o.tokens_out, o.created_at, o.created_at::date AS created_date, o.sent_at,
       l.name, l.industry, l.area, l.source
FROM outreach o JOIN a_leads l ON l.id = o.business_id;
