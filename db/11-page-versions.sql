-- Lưu prompt đã gửi + mọi phiên bản HTML của từng màn hình (LLM gen, sửa tay, gen lại từ prompt đã chỉnh)
ALTER TABLE outreach ADD COLUMN IF NOT EXISTS prompts jsonb;   -- prompt các bước plan / screens / judge

CREATE TABLE IF NOT EXISTS page_versions (
  id           bigserial PRIMARY KEY,
  outreach_id  bigint NOT NULL REFERENCES outreach(id) ON DELETE CASCADE,
  slug         text   NOT NULL,
  source       text   NOT NULL CHECK (source IN ('llm', 'edit', 'regen')),
  prompt       jsonb,          -- {system, user}: system KHÔNG gồm file skill (luôn ghép bản skill mới nhất khi gửi)
  html         text   NOT NULL, -- HTML thô LLM trả về / bạn sửa
  tokens_in    integer,
  tokens_out   integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_versions_page_idx ON page_versions (outreach_id, slug, created_at DESC);
