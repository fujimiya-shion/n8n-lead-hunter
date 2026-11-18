# Lead Hunter

Tự động tìm lead làm web từ Google Maps (gosom/google-maps-scraper, miễn phí, chạy local), audit website, chấm điểm.
Apify để dành cho Facebook.
Dừng ở bước có danh sách lead. Liên hệ khách là việc của bạn.

| Dịch vụ | URL mặc định | Biến cổng trong `.env` |
|---|---|---|
| n8n | http://localhost:5678 | `FORWARD_N8N_PORT` |
| gosom scraper | http://localhost:8081 | `FORWARD_GMAPS_PORT` |
| NocoDB | http://localhost:8090 | `FORWARD_NOCODB_PORT` |
| Metabase | http://localhost:3000 | `FORWARD_METABASE_PORT` |
| PostgreSQL | `localhost:5433` · DB `leads` | `FORWARD_POSTGRES_PORT` |

Mọi cổng chỉ mở trên `127.0.0.1`. Đụng cổng với project khác thì đổi biến `FORWARD_*_PORT` trong `.env`
rồi chạy `docker compose up -d`. Các container nói chuyện với nhau qua mạng Docker nội bộ,
nên đổi cổng host không ảnh hưởng workflow.

Tất cả service dùng `restart: unless-stopped`, và Docker được bật tự chạy cùng máy (`systemctl enable docker`):
bật máy lên là hệ thống tự chạy lại, trừ khi bạn đã chủ động `docker compose stop` trước đó.

## Luồng chạy

```
22:55        07 · Apify: đồng bộ quota (đã dùng, hạn mức, ngày reset)
23:00        01 · Maps: gửi job crawl
             plan_crawl_jobs() → chọn CRAWL_JOBS_PER_RUN cặp ngành × khu vực chưa crawl trong 30 ngày
             gửi sang gosom (depth GMAPS_DEPTH, có lấy email) → lưu external_id
23:00–05:55  03 · Maps: thu kết quả (5 phút/lần)
             job nào xong → tải CSV → chuyển sang JSON → ingest_places()
             (chuẩn hoá SĐT, lọc email rác, chống trùng theo placeId, chấm điểm) → xoá job bên gosom
01:00        02 · Audit website
       Lấy business có website thật → thử HTTPS → nếu lỗi thử HTTP
       Phân tích HTML: SSL, viewport (responsive), năm copyright, CMS, email/SĐT/fanpage/Zalo
       save_audit() + rescore()
```

23:05        05 · Facebook: tìm lead mới - gửi job (apify/facebook-search-scraper)
23:00–05:55  06 · Facebook: thu kết quả (5 phút/lần) → ingest_facebook_search()
             gộp với lead có sẵn nếu trùng fanpage hoặc SĐT, ghi chi phí thật của run
02:00        04 · Facebook: enrich fanpage (Apify)
             lấy FB_PAGES_PER_RUN lead có fanpage (điểm cao trước, chưa enrich trong 90 ngày)
             apify/facebook-pages-scraper → follower, email, SĐT, website, có đang chạy quảng cáo không
             save_facebook() → thêm liên hệ + chấm lại điểm

Lead đạt **≥ 60 điểm** tự chuyển từ `new` sang `to_contact`.

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

# Chạy workflow từ terminal (không cần mở UI)
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
