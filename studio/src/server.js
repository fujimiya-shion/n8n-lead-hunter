// Studio: API + phục vụ trang demo/ảnh + trang duyệt.
// KHÔNG có chức năng gửi tin. Bạn tự copy nội dung và tự gửi.
import Fastify from 'fastify';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateForLead, shotsDir, tmpDir, loadStoredPage, buildStoredPage, replacePageHtml, regeneratePage, skillInfo } from './generate.js';
import { htmlPrompt } from './prompts.js';
import { llmConfigured, MODEL } from './llm.js';
import { photosEnabled, photoSources, shopPhoto } from './images.js';

const PORT = Number(process.env.PORT || 8082);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 15 });
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 1024 * 1024 });

// ---------- hàng đợi tạo demo (lưu trong bảng generate_queue, chạy lần lượt từng lead) ----------
// Bạn chọn lead trên trang quản trị → thêm vào hàng đợi. Thêm được khi đang chạy; lead chưa chạy thì huỷ được.
// Studio khởi động lại (restart / máy reboot) → bản demo đang tạo dở bị đánh dấu failed, lead đang chạy dở được chạy lại.
await pool.query(`UPDATE outreach SET status = 'failed', error = 'Studio khởi động lại khi đang tạo (bỏ dở)', updated_at = now() WHERE status = 'generating'`)
  .then((r) => r.rowCount && app.log.warn(`Đánh dấu ${r.rowCount} bản demo bỏ dở là failed`)).catch(() => {});
await pool.query(`UPDATE generate_queue SET status = 'pending', started_at = NULL WHERE status = 'running'`).catch(() => {});

// Chạy song song tối đa `outreach_parallel_leads` lead (mặc định 5); mỗi lead lại gọi song song `outreach_llm_concurrency` màn hình.
const active = new Set();   // id các mục generate_queue đang chạy trong tiến trình này
let filling = false;
async function runQueue() {
  if (filling) return;
  filling = true;
  try {
    const limit = Math.max(1, Math.min(10, Number((await pool.query(`SELECT value FROM settings WHERE key = 'outreach_parallel_leads'`)).rows[0]?.value) || 5));
    while (active.size < limit) {
      const item = (await pool.query(
        `UPDATE generate_queue SET status = 'running', started_at = now()
         WHERE id = (SELECT id FROM generate_queue WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, business_id`)).rows[0];
      if (!item) break;
      active.add(item.id);
      runItem(item).finally(() => { active.delete(item.id); runQueue(); });
    }
  } catch (e) { app.log.error(e, 'runQueue'); }
  finally { filling = false; }
}

async function runItem(item) {
  try {
    const oid = await generateForLead(pool, Number(item.business_id));
    await pool.query(`UPDATE generate_queue SET status = 'done', outreach_id = $2, finished_at = now() WHERE id = $1`, [item.id, oid]);
  } catch (e) {
    const err = String(e.message || e).slice(0, 300);
    app.log.error({ bid: item.business_id, err }, 'generate failed');
    const oid = (await pool.query(`SELECT max(id) AS id FROM outreach WHERE business_id = $1`, [item.business_id]).catch(() => ({ rows: [] }))).rows[0]?.id;
    await pool.query(`UPDATE generate_queue SET status = 'failed', error = $2, outreach_id = $3, finished_at = now() WHERE id = $1`, [item.id, err, oid ?? null]).catch(() => {});
  }
}

async function enqueue(ids) {
  const r = await pool.query(
    `INSERT INTO generate_queue (business_id)
     SELECT b.id FROM businesses b WHERE b.id = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM generate_queue q WHERE q.business_id = b.id AND q.status IN ('pending', 'running'))
     ORDER BY array_position($1, b.id) RETURNING id`, [ids]);
  runQueue();
  return r.rowCount;
}

/** Lượt hiện tại = các mục từ lúc hàng đợi bắt đầu bận; rảnh thì hiện 20 mục gần nhất trong 24 giờ */
async function jobState() {
  const rows = (await pool.query(
    `WITH since AS (SELECT min(created_at) AS t FROM generate_queue WHERE status IN ('pending', 'running'))
     SELECT q.id AS qid, q.business_id AS id, b.name, q.status, q.outreach_id, q.error, q.started_at AS "startedAt", q.finished_at AS "finishedAt",
            q.created_at >= coalesce((SELECT t FROM since), 'infinity') AS in_batch
     FROM generate_queue q JOIN businesses b ON b.id = q.business_id
     WHERE q.status IN ('pending', 'running') OR q.created_at >= coalesce((SELECT t FROM since), now() - interval '24 hours')
     ORDER BY q.id DESC LIMIT 60`)).rows.reverse().map((x) => ({ ...x, id: Number(x.id), outreach_id: x.outreach_id && Number(x.outreach_id) }));
  const batch = rows.filter((x) => x.in_batch && x.status !== 'cancelled');
  const runningRows = rows.filter((x) => x.status === 'running');
  return {
    busy: rows.some((x) => ['pending', 'running'].includes(x.status)),
    total: batch.length, done: batch.filter((x) => x.status === 'done').length, failed: batch.filter((x) => x.status === 'failed').length,
    current: runningRows[0]?.id ?? null, running: runningRows.length, lastError: [...rows].reverse().find((x) => x.error)?.error ?? null, queue: rows,
  };
}

/** Dùng cho scripts/run-pipeline.sh (?wait=1): chờ đến khi hàng đợi chạy xong */
async function waitQueue() {
  let s;
  while ((s = await jobState()).busy) await new Promise((r) => setTimeout(r, 3000));
  return { total: s.total, done: s.done, failed: s.failed, lastError: s.lastError };
}
setTimeout(() => runQueue(), 3000); // chạy tiếp các lead còn chờ sau khi khởi động lại

async function settingNum(key, fallback) {
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  const n = Number(r.rows[0]?.value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------- API ----------
app.get('/api/status', async () => {
  const threshold = await settingNum('outreach_ready_threshold', 80);
  const c = (await pool.query(
    `SELECT
       count(*) FILTER (WHERE status = 'draft')      AS draft,
       count(*) FILTER (WHERE status = 'approved')   AS approved,
       count(*) FILTER (WHERE status = 'generating') AS generating,
       count(*) FILTER (WHERE status = 'failed')     AS failed,
       count(*) FILTER (WHERE status = 'sent')       AS sent,
       count(*) FILTER (WHERE status = 'skipped')    AS skipped,
       count(*) FILTER (WHERE status IN ('draft','approved') AND confidence >= $1) AS ready,
       count(*) FILTER (WHERE status = 'sent' AND sent_at > now() - interval '7 days') AS sent_7d,
       coalesce(sum(tokens_in), 0) AS tokens_in, coalesce(sum(tokens_out), 0) AS tokens_out
     FROM outreach`, [threshold])).rows[0];
  const counts = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
  return {
    llm_configured: llmConfigured(), model: MODEL || null, photos_enabled: photosEnabled(), photo_sources: photoSources(),
    ready_threshold: threshold,
    per_run: await settingNum('outreach_per_run', 10),
    eligible: Number((await pool.query('SELECT count(*) FROM pick_outreach_leads(1000)')).rows[0].count),
    counts, job: await jobState(),
  };
});

// Tạo demo: body.ids = các lead bạn chọn trên trang quản trị.
// Không có ids → lấy N lead tốt nhất chưa có demo (dùng khi chạy theo lịch; tắt được bằng setting outreach_auto_generate).
// ?wait=1 → chờ chạy xong mới trả (scripts/run-pipeline.sh)
app.post('/api/generate-batch', async (req, reply) => {
  if (!llmConfigured()) return reply.code(400).send({ error: 'Chưa cấu hình LLM trong .env (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)' });
  let ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 100) : null;
  if (!ids) {
    if (String((await pool.query(`SELECT value FROM settings WHERE key = 'outreach_auto_generate'`)).rows[0]?.value) === 'false') {
      return { total: 0, message: 'Tự tạo demo theo lịch đang tắt (outreach_auto_generate = false)' };
    }
    const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || (await settingNum('outreach_per_run', 5))));
    ids = (await pool.query('SELECT business_id FROM pick_outreach_leads($1)', [limit])).rows.map((r) => Number(r.business_id));
  }
  if (!ids.length) return { total: 0, message: 'Không có lead nào để tạo demo' };
  const added = await enqueue(ids);
  if (req.query.wait) return waitQueue();
  return reply.code(202).send({ added });
});

app.post('/api/leads/:bid/regenerate', async (req, reply) => {
  if (!llmConfigured()) return reply.code(400).send({ error: 'Chưa cấu hình LLM trong .env' });
  const added = await enqueue([Number(req.params.bid)]);
  return reply.code(202).send({ added });
});

// Huỷ 1 lead đang chờ trong hàng đợi (lead đang chạy thì không huỷ được)
app.delete('/api/queue/:bid', async (req, reply) => {
  const r = await pool.query(`UPDATE generate_queue SET status = 'cancelled', finished_at = now() WHERE business_id = $1 AND status = 'pending'`, [Number(req.params.bid)]);
  return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'Lead không còn trong hàng chờ' });
});

// ---------- danh sách lead đã crawl ----------
const LEAD_SORT = { created: 'l.first_seen_at', score: 'l.score', reviews: 'l.review_count', rating: 'l.rating', name: 'l.name' };
app.get('/api/leads', async (req) => {
  const q = req.query;
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll('$?', `$${args.length}`)); };
  if (q.q) add(`(l.name ILIKE $? OR l.phone ILIKE $? OR l.website_url ILIKE $? OR l.area ILIKE $?)`, `%${String(q.q).trim()}%`);
  if (q.industry) add('l.industry = ANY($?)', String(q.industry).split(','));
  if (q.area) add('l.area = ANY($?)', String(q.area).split(','));
  if (q.website) add('l.website_label = ANY($?)', String(q.website).split(','));
  if (q.status) add('l.status = ANY($?)', String(q.status).split(','));
  if (q.source) add('l.source = ANY($?)', String(q.source).split(','));
  if (q.min_score) add('l.score >= $?', Number(q.min_score));
  if (q.phone === '1') where.push('l.phone IS NOT NULL');
  if (q.demo === 'none') where.push('d.id IS NULL');
  if (q.demo === 'has') where.push('d.id IS NOT NULL');
  if (q.demo && !['none', 'has'].includes(q.demo)) add('d.status = $?', q.demo);
  const sort = LEAD_SORT[q.sort] || LEAD_SORT.created;
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const size = Math.max(10, Math.min(200, Number(q.pageSize) || 50));
  const page = Math.max(1, Number(q.page) || 1);
  const from = `FROM a_leads l
    LEFT JOIN LATERAL (SELECT o.id, o.status, o.confidence, o.created_at FROM outreach o
                       WHERE o.business_id = l.id AND o.status <> 'skipped' ORDER BY o.created_at DESC LIMIT 1) d ON true
    LEFT JOIN web_audit wa ON wa.business_id = l.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const total = Number((await pool.query(`SELECT count(*) ${from}`, args)).rows[0].count);
  const rows = (await pool.query(
    `SELECT l.id, l.name, l.score, l.score_reasons, l.status, l.status_label, l.source, l.industry, l.area, l.website_label, l.website_url,
            l.web_reachable, l.has_ssl, l.is_mobile_friendly, l.rating, l.review_count, l.phone, l.emails, l.maps_url, l.facebook_url,
            l.fb_followers, l.first_seen_at, wa.error AS web_issue, wa.status_code AS web_status, d.id AS demo_id, d.status AS demo_status, d.confidence AS demo_confidence
     ${from} ORDER BY ${sort} ${dir} NULLS LAST, l.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, args)).rows;
  return { total, rows };
});

app.get('/api/leads/facets', async () => {
  const f = async (col) => (await pool.query(`SELECT ${col} AS v, count(*)::int AS n FROM a_leads WHERE ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`)).rows;
  return { industry: await f('industry'), area: await f('area'), website: await f('website_label'), status: await f('status_label || \'|\' || status'), source: await f('source') };
});

// ---------- cài đặt (chỉ các khoá của studio) ----------
const EDITABLE = /^outreach_/;
app.get('/api/settings', async () => (await pool.query(
  `SELECT key, value, description FROM settings WHERE key LIKE 'outreach\\_%' ORDER BY key`)).rows);
app.put('/api/settings/:key', async (req, reply) => {
  const key = String(req.params.key);
  if (!EDITABLE.test(key)) return reply.code(400).send({ error: 'Không được sửa khoá này' });
  const r = await pool.query('UPDATE settings SET value = $2 WHERE key = $1', [key, String(req.body?.value ?? '').slice(0, 500)]);
  return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'Không có khoá này' });
});

const OUTREACH_SQL = `SELECT o.id, o.business_id, o.status, o.message, o.message_original, o.demo_title, o.confidence,
            o.lead_score, o.human_score, o.fit_score, o.judge_issues, o.error, o.created_at, o.sent_at, o.tokens_in, o.tokens_out,
            o.shots, left(md5(coalesce(o.shots::text, '')), 10) AS shots_v, o.site_plan->'old_site'->>'url' AS old_site_url,
            o.site_plan->'brand' AS brand,
            (SELECT jsonb_agg(jsonb_build_object('slug', p->>'slug', 'title', p->>'title', 'kind', p->>'kind')) FROM jsonb_array_elements(o.llm_pages) p) AS llm_list,
            l.name, l.phone, l.industry, l.area, l.source, l.score, l.website_label, l.website_url, l.review_count, l.rating,
            l.score_reasons, l.maps_url, l.facebook_url
     FROM outreach o JOIN a_leads l ON l.id = o.business_id`;

app.get('/api/outreach', async (req) => {
  const statuses = String(req.query.status || 'draft,approved,generating,failed').split(',');
  return (await pool.query(`${OUTREACH_SQL} WHERE o.status = ANY($1) ORDER BY o.created_at DESC, o.id DESC LIMIT 500`, [statuses])).rows;
});

app.get('/api/outreach/:id', async (req, reply) => {
  const r = (await pool.query(`${OUTREACH_SQL} WHERE o.id = $1`, [Number(req.params.id)])).rows[0];
  return r || reply.code(404).send({ error: 'Không có bản demo này' });
});

// Sửa tin nhắn / đổi trạng thái 1 bản
app.patch('/api/outreach/:id', async (req, reply) => {
  const id = Number(req.params.id);
  const { message, status } = req.body || {};
  if (typeof message === 'string') {
    await pool.query('UPDATE outreach SET message = $2, updated_at = now() WHERE id = $1', [id, message.slice(0, 4000)]);
  }
  if (status) {
    const res = await setStatus([id], status);
    if (res.error) return reply.code(400).send(res);
  }
  return { ok: true };
});

// Thao tác hàng loạt: approve | skip | sent | draft
app.post('/api/outreach/bulk', async (req, reply) => {
  const ids = (req.body?.ids || []).map(Number).filter(Boolean);
  const res = await setStatus(ids, req.body?.status);
  if (res.error) return reply.code(400).send(res);
  return res;
});

async function setStatus(ids, status) {
  const map = { approved: 'approved', skipped: 'skipped', sent: 'sent', draft: 'draft' };
  if (!map[status] || !ids.length) return { error: 'Trạng thái không hợp lệ' };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE outreach SET status = $2, updated_at = now(),
         approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END,
         sent_at     = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
       WHERE id = ANY($1) AND status IN ('draft','approved') RETURNING business_id`,
      [ids, status],
    );
    // Bạn đã tự gửi → lead chuyển sang "đã liên hệ" (trigger tự ghi contacted_at)
    if (status === 'sent' && r.rows.length) {
      await client.query(
        `UPDATE businesses SET status = 'contacted' WHERE id = ANY($1) AND status IN ('new','to_contact')`,
        [r.rows.map((x) => x.business_id)],
      );
    }
    await client.query('COMMIT');
    return { updated: r.rowCount };
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally {
    client.release();
  }
}

// ---------- trang tạm để chụp + ảnh chụp ----------
// HTML dựng từ JSON của LLM → chạy trong sandbox (origin riêng, không gọi được API của trang duyệt)
const DEMO_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  'img-src data: https://images.pexels.com https://images.unsplash.com',
  'sandbox allow-scripts',
].join('; ');

// File tạm chỉ tồn tại trong lúc Playwright chụp, chụp xong bị xoá
app.get('/render/:name', async (req, reply) => {
  const name = String(req.params.name);
  if (!/^[\w.-]+$/.test(name)) return reply.code(404).send();
  try {
    const html = await fs.readFile(path.join(tmpDir(), `${name}.html`), 'utf8');
    return reply.header('Content-Security-Policy', DEMO_CSP).type('text/html; charset=utf-8').send(html);
  } catch { return reply.code(404).send('Trang tạm đã bị xoá'); }
});

app.get('/shots/:id/:file', async (req, reply) => {
  const id = Number(req.params.id), file = String(req.params.file);
  if (!Number.isInteger(id) || !/^[\w.-]+\.png$/.test(file)) return reply.code(404).send();
  try {
    const buf = await fs.readFile(path.join(shotsDir(id), file));
    return reply.header('Cache-Control', 'no-cache').type('image/png').send(buf);
  } catch { return reply.code(404).send(); }
});

// ---------- xem HTML thật của tab "LLM tự thiết kế" (dựng lại từ HTML đã lưu, không gọi LLM viết lại) ----------
const escHtml = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Trang chi tiết demo & trang sửa màn hình nằm trong app quản trị (React) → chuyển hướng
app.get('/view/:id', async (req, reply) => reply.redirect(`/#/demo/${Number(req.params.id)}`));
app.get('/edit/:id/:slug', async (req, reply) => reply.redirect(`/#/edit/${Number(req.params.id)}/${encodeURIComponent(req.params.slug)}`));

// Prompt các bước + danh sách màn hình của 1 bản demo
app.get('/api/outreach/:id/prompts', async (req, reply) => {
  const r = (await pool.query(
    `SELECT o.prompts, (SELECT jsonb_agg(jsonb_build_object('slug', p->>'slug', 'title', p->>'title', 'kind', p->>'kind', 'brief', p->>'brief',
              'edited_at', p->>'edited_at', 'regenerated_at', p->>'regenerated_at', 'truncated', p->'truncated')) FROM jsonb_array_elements(o.llm_pages) p) AS screens,
            o.site_plan->'screens' AS planned
     FROM outreach o WHERE o.id = $1`, [Number(req.params.id)])).rows[0];
  return r || reply.code(404).send({ error: 'Không có bản demo này' });
});

app.get('/view/:id/:slug', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send('Không có màn hình này');
  const html = await buildStoredPage(pool, x.o, x.lead, x.page, x.page.html);
  return reply.header('Content-Security-Policy', DEMO_CSP).type('text/html; charset=utf-8').send(html);
});

// ---------- 1 màn hình: xem HTML, xem/chỉnh prompt, sửa HTML → lưu & chụp lại, chỉnh prompt → gen lại bằng LLM ----------
// Gen lại chạy nền (LLM mất 1–5 phút); trang sửa hỏi trạng thái định kỳ.
const regen = new Map(); // "id/slug" → { running, startedAt, doneAt, error, shots }
const regenKey = (id, slug) => `${Number(id)}/${slug}`;

/** Prompt bước 3 của màn hình. Bản tạo trước khi có tính năng lưu prompt → dựng lại gần đúng từ dữ liệu đã lưu. */
async function promptOf(x) {
  if (x.page.prompt?.user) return { prompt: x.page.prompt, rebuilt: false };
  const screens = x.o.site_plan?.screens || x.o.site_plan?.llm_screens || x.o.llm_pages;
  const hasShopPhoto = Boolean(await shopPhoto(pool, x.o.business_id).catch(() => null));
  return { prompt: htmlPrompt(x.lead, x.o.site_plan.brand, x.page, screens, { hasShopPhoto }), rebuilt: true };
}

app.get('/api/outreach/:id/pages/:slug', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send({ error: 'Không có màn hình này' });
  const { prompt, rebuilt } = await promptOf(x);
  const versions = (await pool.query(
    `SELECT id, source, tokens_in, tokens_out, created_at, length(html) AS chars FROM page_versions
     WHERE outreach_id = $1 AND slug = $2 ORDER BY created_at DESC LIMIT 50`, [x.o.id, x.page.slug])).rows;
  return {
    id: x.o.id, slug: x.page.slug, title: x.page.title, kind: x.page.kind, status: x.o.status,
    html: x.page.html, prompt, prompt_rebuilt: rebuilt, skill_chars: (await skillInfo()).chars,
    versions, regen: regen.get(regenKey(x.o.id, x.page.slug)) || null,
  };
});

app.get('/api/page-versions/:vid', async (req, reply) => {
  const v = (await pool.query(`SELECT id, outreach_id, slug, source, prompt, html, created_at FROM page_versions WHERE id = $1`, [Number(req.params.vid)])).rows[0];
  return v || reply.code(404).send({ error: 'Không có phiên bản này' });
});

app.get('/skill', async (req, reply) => reply.type('text/plain; charset=utf-8').send((await skillInfo()).text));

// Xem trước: dựng HTML đã sửa vào file tạm (ghi đè cùng tên), không đụng DB
app.post('/api/outreach/:id/pages/:slug/preview', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send({ error: 'Không có màn hình này' });
  try {
    const html = await buildStoredPage(pool, x.o, x.lead, x.page, String(req.body?.html || ''));
    await fs.mkdir(tmpDir(), { recursive: true });
    const name = `preview-${x.o.id}-${x.page.slug.replace(/[^\w-]/g, '')}`;
    await fs.writeFile(path.join(tmpDir(), `${name}.html`), html, 'utf8');
    return { url: `/render/${name}?t=${Date.now()}` };
  } catch (e) { return reply.code(400).send({ error: String(e.message || e) }); }
});

const pageBusy = (x) => (x.o.status === 'generating' ? 'Bản demo đang được tạo, chờ xong rồi sửa'
  : regen.get(regenKey(x.o.id, x.page.slug))?.running ? 'Màn hình này đang được LLM gen lại' : null);

// Lưu HTML sửa tay: kiểm tra → chụp lại màn hình đó → thay ảnh cũ + HTML trong DB (+ lưu phiên bản)
app.post('/api/outreach/:id/pages/:slug', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send({ error: 'Không có màn hình này' });
  const busy = pageBusy(x);
  if (busy) return reply.code(409).send({ error: busy });
  try {
    const r = await replacePageHtml(pool, x, String(req.body?.html || ''), { source: 'edit' });
    await fs.rm(path.join(tmpDir(), `preview-${x.o.id}-${x.page.slug.replace(/[^\w-]/g, '')}.html`), { force: true });
    return { ok: true, shots: r.shots };
  } catch (e) {
    return reply.code(e.status || 500).send({ error: e.status ? String(e.message) : `Chụp lỗi: ${String(e.message || e)}` });
  }
});

// Chỉnh prompt → gen lại bằng LLM (chạy nền) → chụp lại
app.post('/api/outreach/:id/pages/:slug/regenerate', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send({ error: 'Không có màn hình này' });
  const busy = pageBusy(x);
  if (busy) return reply.code(409).send({ error: busy });
  if (!llmConfigured()) return reply.code(400).send({ error: 'Chưa cấu hình LLM' });
  const prompt = { system: String(req.body?.system ?? ''), user: String(req.body?.user ?? '') };
  if (prompt.user.trim().length < 20) return reply.code(400).send({ error: 'Prompt user quá ngắn' });
  if (prompt.system.length + prompt.user.length > 60000) return reply.code(400).send({ error: 'Prompt quá dài (tối đa 60k ký tự)' });
  const key = regenKey(x.o.id, x.page.slug);
  const st = { running: true, startedAt: new Date().toISOString(), doneAt: null, error: null, shots: 0 };
  regen.set(key, st);
  regeneratePage(pool, x, prompt)
    .then((r) => { st.shots = r.shots; })
    .catch((e) => { st.error = String(e.message || e).slice(0, 300); req.log.error(e); })
    .finally(() => { st.running = false; st.doneAt = new Date().toISOString(); });
  return reply.code(202).send({ ok: true, regen: st });
});

app.get('/', async (req, reply) => reply.type('text/html; charset=utf-8').send(await fs.readFile(path.join(PUBLIC_DIR, 'index.html'))));
app.get('/app.js', async (req, reply) => reply.header('Cache-Control', 'no-cache').type('text/javascript; charset=utf-8').send(await fs.readFile(path.join(PUBLIC_DIR, 'app.js'))));

// Bản nháp kẹt ở "generating" do service khởi động lại → đánh dấu lỗi
await pool.query(`UPDATE outreach SET status = 'failed', error = 'service khởi động lại giữa chừng' WHERE status = 'generating'`).catch(() => {});
await app.listen({ host: '0.0.0.0', port: PORT });
