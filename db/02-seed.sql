-- Ngành: priority 3 = rất ưu tiên, 2 = ưu tiên, 1 = thường
INSERT INTO industries (keyword, priority) VALUES
  ('nha khoa', 3),
  ('spa', 3),
  ('thẩm mỹ viện', 3),
  ('phòng khám', 2),
  ('trung tâm tiếng Anh', 2),
  ('nội thất', 2),
  ('garage ô tô', 2),
  ('nhà hàng', 1);

-- Khu vực: "query" là chuỗi gửi cho Apify (Google geocode)
INSERT INTO locations (name, query) VALUES
  ('Quận 7',      'Quận 7, Hồ Chí Minh, Vietnam'),
  ('Quận 1',      'Quận 1, Hồ Chí Minh, Vietnam'),
  ('Quận 3',      'Quận 3, Hồ Chí Minh, Vietnam'),
  ('Bình Thạnh',  'Bình Thạnh, Hồ Chí Minh, Vietnam'),
  ('Phú Nhuận',   'Phú Nhuận, Hồ Chí Minh, Vietnam'),
  ('Thủ Đức',     'Thủ Đức, Hồ Chí Minh, Vietnam');
