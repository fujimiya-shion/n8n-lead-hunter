-- Trang quản trị: bạn tự chọn lead để tạo demo. Lịch chạy hằng ngày chỉ tự tạo demo khi bật setting này.
INSERT INTO settings (key, value, description) VALUES
  ('outreach_auto_generate', 'false', 'Lịch chạy hằng ngày tự tạo demo cho outreach_per_run lead điểm cao nhất (true) hoặc chỉ tạo khi bạn chọn lead trên trang quản trị (false)')
ON CONFLICT (key) DO NOTHING;
