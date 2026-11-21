-- Số token đầu vào trúng cache prompt của provider (rẻ hơn token thường) → theo dõi hiệu quả cache
ALTER TABLE outreach      ADD COLUMN IF NOT EXISTS tokens_cached integer;
ALTER TABLE page_versions ADD COLUMN IF NOT EXISTS tokens_cached integer;
