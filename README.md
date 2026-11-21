# Lead Hunter

Tự động tìm lead làm web từ Google Maps (gosom/google-maps-scraper, miễn phí, chạy local), audit website, chấm điểm.
Apify để dành cho Facebook.
Mỗi lead nóng có sẵn demo web + tin nhắn chào hàng do LLM tạo để bạn duyệt. **Việc gửi tin do bạn tự làm**, hệ thống không gửi gì.

| Dịch vụ | URL mặc định | Biến cổng trong `.env` |
|---|---|---|
| n8n | http://localhost:5678 | `FORWARD_N8N_PORT` |
| gosom scraper | http://localhost:8081 | `FORWARD_GMAPS_PORT` |
| NocoDB | http://localhost:8090 | `FORWARD_NOCODB_PORT` |
| Metabase | http://localhost:3000 | `FORWARD_METABASE_PORT` |
| **Lead Studio** (demo + tin nhắn) | http://localhost:8082 | `FORWARD_STUDIO_PORT` |
| PostgreSQL | `localhost:5433` · DB `leads` | `FORWARD_POSTGRES_PORT` |

Mọi cổng chỉ mở trên `127.0.0.1`. Đụng cổng với project khác thì đổi biến `FORWARD_*_PORT` trong `.env`
rồi chạy `docker compose up -d`. Các container nói chuyện với nhau qua mạng Docker nội bộ,
nên đổi cổng host không ảnh hưởng workflow.

Tất cả service dùng `restart: unless-stopped`, và Docker được bật tự chạy cùng máy (`systemctl enable docker`):
bật máy lên là hệ thống tự chạy lại, trừ khi bạn đã chủ động `docker compose stop` trước đó.

## Luồng chạy

Lịch do **systemd** điều phối (không phải n8n), để máy được **tự đánh thức → chạy job → ngủ lại**:

```
SCHEDULE_TIMES (mặc định 10:00)  lead-hunter.timer đánh thức máy (WakeSystem=true)
  scripts/run-pipeline.sh  (chặn sleep và "gập nắp là sleep" trong lúc chạy)
    07 đồng bộ quota Apify → 01 gửi job Maps (gosom) → 05 gửi job Facebook (Apify)
    chờ 03/06 thu hết kết quả (n8n, 5 phút/lần, chạy cả ngày)
    02 audit website → 04 enrich fanpage → studio tạo demo + tin nhắn (nếu có LLM_API_KEY)
  scripts/after-run.sh
    nếu máy do timer đánh thức VÀ màn hình còn khoá hoặc nắp đang gập → cho máy ngủ lại
    nếu bạn đang dùng máy → giữ nguyên
```

- Bỏ qua lượt chạy nếu: đang dùng pin dưới `SCHEDULE_MIN_BATTERY`%, hoặc bạn đã `docker compose stop`.
- Job chưa xong sau `SCHEDULE_MAX_WAIT_MIN` phút: máy vẫn ngủ lại, 03/06 thu tiếp ở lần thức sau.
  Job Apify giữ được 3 ngày (Apify lưu kết quả 7 ngày) nên không mất kết quả đã trả tiền.
- Trong n8n chỉ 03 và 06 ở trạng thái Active. 01, 02, 04, 05, 07 không có lịch, do systemd gọi.

```bash
# Đổi giờ chạy: sửa SCHEDULE_TIMES trong .env (vd 10:00 hoặc 09:00,13:00,17:00) rồi:
scripts/install-scheduler.sh
systemctl list-timers lead-hunter.timer        # lượt chạy kế tiếp
journalctl -u lead-hunter -n 50                # log các lượt chạy
sudo systemctl start lead-hunter               # chạy ngay 1 lượt
sudo env DRY_RUN=1 scripts/run-pipeline.sh     # xem kế hoạch, không gửi job, không tốn credit
scripts/install-scheduler.sh --uninstall       # gỡ lịch
```

Nhiều giờ/ngày: ngân sách Apify và `google_max_per_run` tự chia đều cho các lượt (`settings.runs_per_day`).

## Dashboard & view

**Metabase** (http://localhost:3000 → collection *Lead Hunter* → dashboard *Lead Hunter*): 6 tab, 45 biểu đồ.
Bộ lọc trên cùng (Ngành, Khu vực, Nguồn, Ngày tìm thấy) áp dụng cho mọi biểu đồ dựa trên lead.

| Tab | Nội dung |
|---|---|
| 📊 Tổng quan | KPI, lead mới theo ngày, phân bố điểm, trạng thái, loại website, top 30 lead nóng |
| 🏷 Ngành & khu vực | Bảng 14 chỉ số theo ngành, cơ hội theo ngành, bảng khu vực, bản đồ |
| 🌐 Chất lượng website | Web chết, không SSL, không mobile, copyright cũ, CMS, danh sách web dễ chốt làm lại |
| 🤝 Pipeline bán hàng | Funnel, hoạt động liên hệ theo ngày, tỉ lệ chuyển đổi theo ngành, lịch gọi lại |
| 📘 Facebook & Apify | Ngân sách Apify (đã dùng, còn lại, mỗi lượt, ngày reset), chi phí luỹ kế, follower, so sánh nguồn |
| ⚙️ Vận hành | Kế hoạch lượt tới, job theo ngày, hiệu suất crawler, độ phủ ngành × khu vực, 30 job gần nhất |

Dữ liệu lấy từ các view `a_*` trong `db/06-analytics.sql` (`a_leads` là bảng phẳng mỗi lead một dòng).

**NocoDB** (http://localhost:8090 → base *Lead Hunter* → bảng `businesses`):

| Nhóm | View |
|---|---|
| Gọi khách | 📞 Cần gọi · 🔥 Rất nóng (80+) · 🆕 Mới 7 ngày qua · 🔄 Đang theo dõi · 📅 Lịch gọi lại (Calendar theo `next_call_at`) |
| Theo cơ hội | 🚫 Chưa có website · 📱 Chỉ có fanpage / MXH · 🐢 Web cũ / lỗi · 📣 Đang chạy quảng cáo FB · ✉️ Có email |
| Theo nguồn / nhóm | 🗺 Nguồn: Google Maps · 📘 Nguồn: Facebook · 🏷 Theo ngành · 📍 Theo khu vực |
| Kết quả | ✅ Đã chốt · ❌ Thất bại / bỏ qua · 📋 Pipeline (Kanban) · 🖼 Thẻ lead (Gallery) · 🗂 Tất cả lead |
| Bảng phụ | `crawl_jobs` → 🛠 Lịch sử job · `industries` → 🎯 Theo priority |

Hẹn gọi lại: điền cột `next_call_at` → lead hiện trên 📅 Lịch gọi lại và bảng "Lịch gọi lại sắp tới" trên Metabase.

## Demo web & tin nhắn chào hàng (Lead Studio)

Service `studio` (thư mục `studio/`, Node + Playwright). Trang quản trị: http://localhost:8082

**Chọn lead để tạo demo:** trang **Lead đã crawl** liệt kê toàn bộ lead (lọc theo ngành, khu vực, website, điểm, trạng thái demo).
Tick các lead muốn làm → **Tạo demo** → lead vào **hàng đợi** (bảng `generate_queue`, chạy lần lượt, huỷ được lead chưa chạy;
studio khởi động lại thì lead đang chạy dở được chạy lại). Lịch 10:00 chỉ tự tạo demo khi bật `outreach_auto_generate`
(khi đó lấy `outreach_per_run` lead `to_contact` có SĐT, điểm ≥ `outreach_min_lead_score`). Không có ngành nào bị hardcode.

Mỗi lead:
1. **Web cũ còn sống** (`outreach_old_site`): fetch HTML trang chủ + vài trang con, làm gọn bằng code, LLM phân tích 1 lần
   (nội dung thật, bố cục, điểm yếu, ảnh thật; cache 30 ngày ở `site_snapshots`) → bộ demo là bản **làm mới** web cũ.
2. **Lên kế hoạch** (1 lời gọi): tin nhắn Zalo (3–5 câu, nhắc đúng 1 điểm thật) + thương hiệu (hướng nghệ thuật trong
   `studio/src/directions.js`, màu, font) + danh sách màn hình (trang chủ, rồi các section/modal hợp nghiệp vụ) kèm brief.
3. **Viết HTML/Tailwind** từng màn hình (song song) theo skill `studio/skills/frontend-design.md`; HTML hỏng thì gọi lại 1 lần kèm lỗi.
   *Cache prompt:* phần cố định (skill, quy tắc, danh sách style/font, thông tin chung của lead) luôn đặt ở đầu prompt để provider tự cache; màn hình đầu gửi trước `LLM_CACHE_WARM_MS` (mặc định 4000 ms) rồi mới gửi các màn hình còn lại. Tỉ lệ token trúng cache hiện trên thanh trên cùng của trang 8082.
4. **Ảnh**:
   - **Ảnh thật của shop**: ảnh đại diện Google Maps (gosom) hoặc ảnh bìa fanpage (`businesses.photo_url`), và ảnh thật từ web cũ.
   - **Ảnh stock**: Pixabay → Unsplash → Pexels → Openverse; **MiMo xem ảnh thu nhỏ** và loại ảnh sai ngành
     (`outreach_image_check`, ngưỡng `outreach_image_min_fit`). Không có ảnh đạt → khối màu kèm hình minh hoạ.
5. **Playwright chụp** từng màn hình: toàn trang desktop, mobile, từng khối `data-section`. File HTML tạm bị xoá ngay sau khi chụp.
6. **LLM chấm** `human` (tự nhiên như người viết) và `fit` (đúng nghiệp vụ), cộng luật trừ điểm cụm sáo rỗng.
   `confidence = 0.4 × điểm lead + 0.3 × human + 0.3 × fit`. Từ `outreach_ready_threshold` (80) trở lên là **Sẵn sàng**.
   Confidence chỉ để **xếp hạng**, không dùng để tự gửi.
7. **Duyệt & gửi** (trang quản trị): xem ảnh từng màn hình, sửa tin nhắn (tự lưu), mở/sửa HTML hoặc chỉnh prompt rồi gen lại
   (`/edit/<id>/<màn hình>`, lịch sử ở `page_versions`), duyệt → trang **Gửi tin** copy SĐT, tin nhắn, ảnh (dán thẳng vào Zalo).
   Tự gửi xong bấm **Tôi đã gửi** → lead chuyển `contacted`. Các cài đặt `outreach_*` sửa ở trang **Cài đặt**.

LLM: mọi provider tương thích OpenAI (DeepSeek, Gemini, OpenRouter...). Cấu hình `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
(và `LLM_JUDGE_MODEL` nếu muốn dùng model khác để chấm) trong `.env`, rồi chạy `docker compose up -d studio`.
Ký tên và câu giới thiệu trong tin nhắn: `settings.outreach_sender_name`, `settings.outreach_sender_intro`.

```bash
docker compose up -d --build studio          # build lại sau khi sửa code trong studio/
curl -X POST localhost:8082/api/generate-batch -H 'Content-Type: application/json' -d '{"limit":3}'   # tạo thử 3 lead
docker compose logs -f studio
```

## Cấu hình chạy (sửa trong NocoDB, không cần restart)

`.env` chỉ chứa hạ tầng và bí mật (mật khẩu DB, khoá n8n, Apify token, số tab Chrome của gosom).
Mọi cấu hình chạy nằm trong DB:

| Muốn chỉnh | Ở đâu | Mặc định |
|---|---|---|
| Chạy ngành nào | Bảng `industries`: tick `active`, `priority` (3 = chạy trước) | 31 ngành |
| Chạy khu vực nào | Bảng `locations`: tick `active` | 6 khu vực HCM |
| Số lead Google mỗi đêm (miễn phí, giới hạn để an toàn IP) | `settings.google_max_per_run` | 100 |
| Ngân sách Apify mỗi chu kỳ | `settings.fb_monthly_budget_usd` | 5 |
| % ngân sách dành cho enrich fanpage | `settings.fb_enrich_share_pct` | 20 |
| Độ sâu / lấy email của gosom | `settings.gmaps_depth`, `settings.gmaps_email` | 1 / true |

**Cách tính mỗi đêm** (`run_targets()`):
1. 22:55 workflow 07 lấy quota thật từ Apify: đã dùng bao nhiêu, hạn mức, ngày reset.
2. `ngân sách/đêm = (ngân sách − đã dùng) ÷ số đêm còn lại tới ngày reset`, nên quota được tiêu đều tới đúng ngày reset.
3. Facebook lấy `(100 − fb_enrich_share_pct)%` ngân sách đêm đó để tìm lead mới (≈ $0.006/lead).
   Phần còn lại dùng để enrich fanpage của lead Google (≈ $0.012/page).
4. Google miễn phí nên mỗi đêm luôn chạy tối đa `google_max_per_run`. Không ràng buộc tỉ lệ với Facebook.

Ví dụ với $5 / 30 đêm (giá pages-google $0.012/lead): khoảng 100 Google + 10 Facebook + 2 enrich mỗi đêm.

Xem kế hoạch đêm nay: `SELECT * FROM v_run_plan;` hoặc ô "Kế hoạch đêm nay" trên Metabase.
Số lead **mới** thực tế có thể ít hơn mục tiêu vì lead trùng được gộp lại.

## Công thức điểm (sửa trong hàm `rescore()` ở `db/01-schema.sql`)

| Điều kiện | Điểm |
|---|---|
| Chưa có website | +40 |
| Website chỉ là mạng xã hội / sàn TMĐT | +30 |
| Website không truy cập được | +30 |
| Web dựng bằng công cụ miễn phí (sites.google, wixsite...) | +20 |
| Không SSL / Không responsive | +15 / +15 |
| Copyright trước 2021 | +10 |
| ≥ 50 review / Rating ≥ 4.3 | +10 / +10 |
| Có SĐT gọi được (không phải 1900/1800) | +10 |
| Có email | +5 |
| Ngành priority ≥ 2 | +10 |
| Fanpage đang chạy quảng cáo | +15 |
| Fanpage ≥ 1.000 follower | +10 |
| Fanpage ghi website riêng (thực ra đã có web) | −20 |

## Lệnh hay dùng

```bash
cd ~/Workspace/N8N/lead-hunter
docker compose up -d                 # bật
docker compose down                  # tắt (giữ dữ liệu)
docker compose restart n8n           # sau khi sửa .env
docker compose exec n8n sh /import/import.sh   # import lại workflow sau khi sửa file JSON

# Chạy riêng từng workflow từ terminal (không cần mở UI)
lhx() { docker compose exec -e N8N_RUNNERS_BROKER_PORT=5690 -e QUEUE_HEALTH_CHECK_PORT=5691 n8n n8n execute --id "$1"; }
lhx LhCrawlMaps00001     # 01 Maps: gửi job
lhx LhCollectMaps001     # 03 Maps: thu kết quả (chạy lại sau vài phút nếu job chưa xong)
lhx LhAuditWebsite01     # 02 audit website
lhx LhEnrichFbPage01     # 04 enrich fanpage của lead Maps (tốn credit Apify)
lhx LhFbSearchSend01     # 05 Facebook: gửi job tìm lead mới (tốn credit Apify)
lhx LhFbSearchColl01     # 06 Facebook: thu kết quả
lhx LhSyncApifyQta1      # 07 đồng bộ quota Apify (không tốn credit)

# Vào SQL
docker compose exec postgres psql -U leadhunter -d leads

# Backup
docker compose exec postgres pg_dump -U leadhunter leads > backup-$(date +%F).sql
```

## Thêm ngành / khu vực

Dùng NocoDB (bảng `industries`, `locations`) hoặc SQL:

```sql
INSERT INTO industries (keyword, priority) VALUES ('khách sạn', 2);
INSERT INTO locations (name, query) VALUES ('Gò Vấp', 'Gò Vấp, Hồ Chí Minh, Vietnam');
UPDATE industries SET active = false WHERE keyword = 'nhà hàng';   -- tạm tắt
```

## Câu SQL cho dashboard Metabase

```sql
-- KPI tổng
SELECT count(*) AS tong_lead,
       count(*) FILTER (WHERE first_seen_at::date = current_date)        AS moi_hom_nay,
       count(*) FILTER (WHERE status = 'to_contact')                     AS can_lien_he,
       round(100.0 * count(phone)  / nullif(count(*),0), 1)              AS pct_co_sdt,
       round(100.0 * count(emails) / nullif(count(*),0), 1)              AS pct_co_email,
       round(100.0 * count(*) FILTER (WHERE website_type <> 'real') / nullif(count(*),0), 1) AS pct_chua_co_web_that
FROM businesses;

-- Ngành nào nhiều cơ hội nhất
SELECT industry, count(*) AS lead,
       round(100.0 * count(*) FILTER (WHERE website_type <> 'real') / count(*), 1) AS pct_chua_co_web,
       round(avg(score)) AS diem_tb
FROM v_leads GROUP BY industry ORDER BY pct_chua_co_web DESC;

-- Lead mới theo ngày
SELECT first_seen_at::date AS ngay, count(*) FROM businesses GROUP BY 1 ORDER BY 1;

-- Funnel của bạn
SELECT status, count(*) FROM businesses GROUP BY status ORDER BY status;

-- Top lead nóng
SELECT name, score, phone, emails, industry, search_area, review_count, rating, score_reasons, maps_url
FROM v_leads WHERE status = 'to_contact' ORDER BY score DESC, review_count DESC LIMIT 50;

-- Sức khoẻ crawler
SELECT started_at::date AS ngay, status, count(*) AS jobs, sum(found) AS found, sum(new_leads) AS new_leads
FROM crawl_jobs GROUP BY 1, 2 ORDER BY 1 DESC;
```

## Ghi chú

- gosom chạy bằng IP nhà: giữ số job mỗi đêm vừa phải để Google không chặn. 1 job depth 1 ≈ 20 địa điểm, mất khoảng 3–5 phút.
- Apify ($5/tháng free) để dành cho Facebook. Token đặt ở `APIFY_TOKEN` trong `.env`.
- Lỗi crawl được ghi ở `crawl_jobs.error`. Job `failed` sẽ được tự chạy lại ở lần sau.
- Chỉ lưu liên hệ doanh nghiệp tự công khai. Ai từ chối thì đặt status `skip` và không liên hệ lại.
