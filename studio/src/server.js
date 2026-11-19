// Studio: API + phục vụ trang demo/ảnh + trang duyệt.
// KHÔNG có chức năng gửi tin. Bạn tự copy nội dung và tự gửi.
import Fastify from 'fastify';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateForLead, shotsDir, tmpDir } from './generate.js';
import { llmConfigured, MODEL } from './llm.js';
import { normalizePlan, normalizePage } from './spec.js';
import { renderPage } from './components.js';
import { resolvePageMedia, photosEnabled, photoSources, illustration } from './images.js';

const PORT = Number(process.env.PORT || 8082);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 1024 * 1024 });

// ---------- hàng đợi tạo demo (tuần tự, 1 lượt tại 1 thời điểm) ----------
const job = { busy: false, total: 0, done: 0, failed: 0, current: null, startedAt: null, lastError: null };

async function runBatch(ids) {
  Object.assign(job, { busy: true, total: ids.length, done: 0, failed: 0, current: null, startedAt: new Date(), lastError: null });
  try {
    for (const bid of ids) {
      job.current = bid;
      try { await generateForLead(pool, bid); job.done++; }
      catch (e) { job.failed++; job.lastError = String(e.message || e); app.log.error({ bid, err: job.lastError }, 'generate failed'); }
    }
  } finally {
    job.busy = false; job.current = null;
  }
  return { total: job.total, done: job.done, failed: job.failed, lastError: job.lastError };
}

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
    counts, job,
  };
});

// Xem trước các lead sẽ được tạo demo ở lượt tới
app.get('/api/eligible', async (req) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
  const r = await pool.query(
    `SELECT l.id, l.name, l.industry, l.area, l.score, l.website_label, l.review_count, l.rating, l.phone
     FROM pick_outreach_leads($1) p JOIN a_leads l ON l.id = p.business_id
     ORDER BY l.score DESC, l.review_count DESC`, [limit]);
  return r.rows;
});

// Tạo demo cho N lead tiếp theo. ?wait=1 → chờ xong mới trả (dùng cho scripts/run-pipeline.sh)
app.post('/api/generate-batch', async (req, reply) => {
  if (!llmConfigured()) return reply.code(400).send({ error: 'Chưa cấu hình LLM trong .env (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)' });
  if (job.busy) return reply.code(409).send({ error: 'Đang tạo demo, chờ lượt hiện tại xong', job });
  const limit = Math.max(1, Math.min(50, Number(req.body?.limit) || (await settingNum('outreach_per_run', 10))));
  const ids = (await pool.query('SELECT business_id FROM pick_outreach_leads($1)', [limit])).rows.map((r) => Number(r.business_id));
  if (!ids.length) return { total: 0, message: 'Không còn lead nào cần tạo demo' };
  if (req.query.wait) return runBatch(ids);
  runBatch(ids);
  return reply.code(202).send({ started: ids.length });
});

app.post('/api/leads/:bid/regenerate', async (req, reply) => {
  if (!llmConfigured()) return reply.code(400).send({ error: 'Chưa cấu hình LLM trong .env' });
  if (job.busy) return reply.code(409).send({ error: 'Đang tạo demo, chờ lượt hiện tại xong' });
  runBatch([Number(req.params.bid)]);
  return reply.code(202).send({ started: 1 });
});

app.get('/api/outreach', async (req) => {
  const statuses = String(req.query.status || 'draft,approved,generating,failed').split(',');
  const r = await pool.query(
    `SELECT o.id, o.business_id, o.status, o.message, o.message_original, o.demo_title, o.confidence,
            o.lead_score, o.human_score, o.fit_score, o.judge_issues, o.error, o.created_at, o.sent_at, o.shots,
            o.site_plan->'brand' AS brand, (SELECT jsonb_agg(jsonb_build_object('slug', p->>'slug', 'title', p->>'title', 'kind', coalesce(p->>'kind', 'page'), 'style', coalesce(o.site_plan->'brand'->>'style', p->>'style'))) FROM jsonb_array_elements(o.site_plan->'pages') p) AS page_list,
            l.name, l.phone, l.industry, l.area, l.source, l.score, l.website_label, l.review_count, l.rating,
            l.score_reasons, l.maps_url, l.facebook_url
     FROM outreach o JOIN a_leads l ON l.id = o.business_id
     WHERE o.status = ANY($1)
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT 300`,
    [statuses],
  );
  return r.rows;
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

// ---------- xem trước thư viện thành phần (spec mẫu, không gọi LLM) ----------
const SAMPLE = JSON.parse(await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-spec.json'), 'utf8'));
app.get('/preview', async (req, reply) => {
  const plan = normalizePlan(SAMPLE.plan, 6);
  return reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>Xem trước thư viện thành phần</title>
<body style="font:15px system-ui;max-width:680px;margin:40px auto;padding:0 16px"><h2>Bộ demo mẫu (dữ liệu mẫu, không gọi LLM)</h2>
<p>Dùng để kiểm tra thư viện thành phần và hệ phong cách. Thêm <code>?style=tên</code> để thử phong cách khác:
${['minimal-business', 'editorial', 'soft-friendly', 'bold-modern', 'clinical-clean', 'luxury'].map((x) => `<code>${x}</code>`).join(', ')}.</p><ul>
${plan.pages.map((p, i) => `<li style="margin:8px 0"><a href="/preview/${i}">${p.title}</a> — phong cách ${p.style}</li>`).join('')}</ul>`);
});
app.get('/preview/:i', async (req, reply) => {
  const plan = normalizePlan(SAMPLE.plan, 6);
  const page = plan.pages[Number(req.params.i)];
  if (!page) return reply.code(404).send('Không có trang này');
  if (req.query.style) page.style = String(req.query.style);
  const p = normalizePlan({ ...SAMPLE.plan, pages: [{ ...SAMPLE.plan.pages[Number(req.params.i)], style: page.style }] }, 1).pages[0];
  const sections = normalizePage(SAMPLE.pages[Number(req.params.i)], p);
  const credits = await resolvePageMedia(pool, sections, 1);
  return reply.header('Content-Security-Policy', DEMO_CSP).type('text/html; charset=utf-8')
    .send(renderPage({ plan, page: p, sections, lead: SAMPLE.lead, credits, brandSvg: await illustration(pool, plan.brand.illustration) }));
});

// ---------- trang duyệt ----------
app.get('/', async (req, reply) => reply.type('text/html; charset=utf-8').send(await fs.readFile(path.join(PUBLIC_DIR, 'index.html'))));

// Bản nháp kẹt ở "generating" do service khởi động lại → đánh dấu lỗi
await pool.query(`UPDATE outreach SET status = 'failed', error = 'service khởi động lại giữa chừng' WHERE status = 'generating'`).catch(() => {});
await app.listen({ host: '0.0.0.0', port: PORT });
