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
import { normalizePlan, normalizePage } from './spec.js';
import { renderPage } from './components.js';
import { resolvePageMedia, photosEnabled, photoSources, illustration, shopPhoto } from './images.js';
import { buildLlmPage } from './llmhtml.js';

const PORT = Number(process.env.PORT || 8082);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const app = Fastify({ logger: { level: 'info' }, bodyLimit: 1024 * 1024 });

// ---------- hàng đợi tạo demo (tuần tự, 1 lượt tại 1 thời điểm) ----------
// Studio vừa khởi động (restart / máy reboot) → bản nào còn 'generating' là bị bỏ dở, không bao giờ xong → đánh dấu failed
await pool.query(`UPDATE outreach SET status = 'failed', error = 'Studio khởi động lại khi đang tạo (bỏ dở)', updated_at = now() WHERE status = 'generating'`)
  .then((r) => r.rowCount && app.log.warn(`Đánh dấu ${r.rowCount} bản demo bỏ dở là failed`)).catch(() => {});
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
            o.lead_score, o.human_score, o.fit_score, o.judge_issues, o.error, o.created_at, o.sent_at, o.shots, left(md5(coalesce(o.shots::text, '')), 10) AS shots_v, o.site_plan->'old_site'->>'url' AS old_site_url,
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

// ---------- xem HTML thật của tab "LLM tự thiết kế" (dựng lại từ HTML đã lưu, không gọi LLM viết lại) ----------
const escHtml = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
app.get('/view/:id', async (req, reply) => {
  const r = (await pool.query(
    `SELECT o.id, o.llm_pages, o.prompts, b.name FROM outreach o JOIN businesses b ON b.id = o.business_id WHERE o.id = $1`, [Number(req.params.id)])).rows[0];
  if (!r) return reply.code(404).send('Không có bản demo này');
  const items = (r.llm_pages || []).map((p) => `<li><a href="/view/${r.id}/${encodeURIComponent(p.slug)}" target="_blank">${escHtml(p.title)}</a> <small>(${escHtml(p.kind)})</small>
    · <a href="/edit/${r.id}/${encodeURIComponent(p.slug)}" target="_blank">sửa HTML / prompt</a></li>`).join('');
  const steps = { oldsite: '0. Phân tích website cũ (HTML đã làm gọn)', plan: '1. Plan (tin nhắn + thương hiệu)', screens: '2. Chọn màn hình', judge: '4. Chấm điểm' };
  const prompts = Object.entries(steps).map(([k, label]) => {
    const msgs = r.prompts?.[k];
    if (!msgs) return '';
    return `<details><summary>${label}</summary>${msgs.map((m) => `<h4>[${escHtml(m.role)}] · ${m.content.length} ký tự</h4><pre>${escHtml(m.content)}</pre>`).join('')}</details>`;
  }).join('');
  return reply.type('text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>Demo #${r.id}</title>
<style>body{font:15px system-ui;max-width:900px;margin:40px auto;padding:0 16px}pre{white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px;font-size:12.5px}
details{border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin:8px 0}summary{cursor:pointer;font-weight:600}h4{margin:12px 0 4px;color:#64748b;font-size:13px}
@media (prefers-color-scheme:dark){body{background:#0b1120;color:#e2e8f0}pre{background:#111827}details{border-color:#1e293b}a{color:#93c5fd}}</style>
<h2>${escHtml(r.name)} · demo #${r.id}</h2><p>Các màn hình LLM tự thiết kế (mở tab mới):</p><ul>${items || '<li>Chưa có</li>'}</ul>
<h3>Prompt các bước chung</h3><p><small>Prompt bước 3 (viết HTML) xem/chỉnh trong trang sửa của từng màn hình.</small></p>${prompts || '<p><small>Bản demo này tạo trước khi có tính năng lưu prompt.</small></p>'}`);
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
  const screens = x.o.site_plan?.llm_screens || x.o.llm_pages;
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

app.get('/edit/:id/:slug', async (req, reply) => {
  const x = await loadStoredPage(pool, req.params.id, req.params.slug);
  if (!x) return reply.code(404).send('Không có màn hình này');
  const api = `/api/outreach/${x.o.id}/pages/${encodeURIComponent(x.page.slug)}`;
  const view = `/view/${x.o.id}/${encodeURIComponent(x.page.slug)}`;
  return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sửa màn hình · ${escHtml(x.page.title)}</title>
<style>
  :root{color-scheme:light dark;--bg:#f8fafc;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--panel:#fff;--soft:#f1f5f9;--accent:#4f46e5}
  @media (prefers-color-scheme:dark){:root{--bg:#0b1120;--fg:#e2e8f0;--muted:#94a3b8;--line:#1e293b;--panel:#0f172a;--soft:#111827}}
  *{box-sizing:border-box} body{margin:0;font:14px system-ui;background:var(--bg);color:var(--fg);height:100vh;display:flex;flex-direction:column}
  header{display:flex;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
  header h1{font-size:15px;margin:0;flex:1;min-width:200px} header small{color:var(--muted);font-weight:400}
  button{font:inherit;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:8px;padding:7px 12px;cursor:pointer}
  button.primary{background:var(--accent);border-color:var(--accent);color:#fff} button:disabled{opacity:.5;cursor:wait}
  a{color:var(--accent)}
  main{flex:1;display:grid;grid-template-columns:minmax(340px,44%) 1fr;min-height:0}
  .left{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line);background:var(--panel)}
  .tabs{display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid var(--line)}
  .tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:none;padding:8px 12px;color:var(--muted)}
  .tabs button.on{color:var(--fg);border-bottom-color:var(--accent);font-weight:600}
  .pane{display:none;flex:1;flex-direction:column;min-height:0} .pane.on{display:flex}
  .bar{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .note{color:var(--muted);font-size:12.5px;padding:8px 10px;line-height:1.5}
  textarea{width:100%;flex:1;resize:none;border:0;padding:12px;font:12.5px/1.5 ui-monospace,Menlo,monospace;background:var(--panel);color:var(--fg);tab-size:2;min-height:0}
  label.lb{font-size:12px;font-weight:600;color:var(--muted);padding:8px 10px 0;display:block}
  #psys{flex:0 0 110px;border-bottom:1px solid var(--line)} #puser{flex:1}
  iframe{width:100%;height:100%;border:0;background:#fff}
  #msg{color:var(--muted);font-size:13px;max-width:46ch} #msg.err{color:#e11d48} #msg.ok{color:#059669}
  .vers{overflow:auto;flex:1} .ver{display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid var(--line);font-size:13px}
  .ver .tag{font-size:11px;padding:2px 8px;border-radius:99px;background:var(--soft)} .ver .grow{flex:1;color:var(--muted)}
  @media (max-width:800px){main{grid-template-columns:1fr;grid-template-rows:55% 45%}}
</style>
<header><h1>${escHtml(x.page.title)} <small>(${escHtml(x.page.kind)}) · demo #${x.o.id} · <a href="/view/${x.o.id}" target="_blank">các màn hình & prompt chung</a></small></h1>
  <span id="msg"></span></header>
<main><div class="left">
  <div class="tabs"><button data-tab="html" class="on">HTML</button><button data-tab="prompt">Prompt</button><button data-tab="vers">Lịch sử</button></div>
  <div class="pane on" id="tab-html">
    <div class="bar"><button id="reset" title="Bỏ thay đổi chưa lưu">Hoàn tác</button><button id="preview" title="Ctrl+Enter">Xem trước</button>
      <button id="save" class="primary" title="Ctrl+S">Lưu &amp; chụp lại</button><a href="${view}" target="_blank" style="margin-left:auto">Mở trang ↗</a></div>
    <textarea id="code" spellcheck="false"></textarea>
  </div>
  <div class="pane" id="tab-prompt">
    <div class="bar"><button id="presetp" title="Về prompt đang lưu">Hoàn tác</button>
      <button id="regen" class="primary">Lưu prompt &amp; gen lại</button></div>
    <div class="note" id="pnote"></div>
    <label class="lb" for="psys">SYSTEM (sau phần skill)</label><textarea id="psys" spellcheck="false"></textarea>
    <label class="lb" for="puser">USER</label><textarea id="puser" spellcheck="false"></textarea>
  </div>
  <div class="pane" id="tab-vers"><div class="note">Mỗi lần LLM gen, sửa tay hay gen lại đều được lưu. "Nạp" đưa HTML + prompt của phiên bản đó vào 2 tab kia (chưa lưu cho tới khi bấm Lưu).</div><div class="vers" id="vers"></div></div>
</div><iframe id="frame" src="${view}"></iframe></main>
<script>
const api = ${JSON.stringify(api)}, view = ${JSON.stringify(view)};
const $ = (id) => document.getElementById(id);
const code = $('code'), frame = $('frame'), msg = $('msg'), psys = $('psys'), puser = $('puser');
let saved = '', savedPrompt = { system: '', user: '' }, poll = null;
const say = (t, cls) => { msg.textContent = t; msg.className = cls || ''; };
const busy = (b) => document.querySelectorAll('.bar button').forEach((x) => (x.disabled = b));
const SRC = { llm: 'LLM gen', edit: 'Sửa tay', regen: 'Gen lại' };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab));
});

async function load(first) {
  const d = await (await fetch(api)).json();
  if (first || code.value === saved) code.value = d.html;
  saved = d.html;
  if (first || (psys.value === savedPrompt.system && puser.value === savedPrompt.user)) { psys.value = d.prompt.system; puser.value = d.prompt.user; }
  savedPrompt = d.prompt;
  $('pnote').innerHTML = 'Khi gửi, SYSTEM = nội dung file <a href="/skill" target="_blank">skills/frontend-design.md</a> (' + d.skill_chars.toLocaleString('vi') + ' ký tự, luôn dùng bản mới nhất) + phần SYSTEM bên dưới.'
    + (d.prompt_rebuilt ? '<br><b>Bản demo này tạo trước khi có tính năng lưu prompt → prompt dưới đây được dựng lại gần đúng.</b>' : '');
  $('vers').innerHTML = d.versions.map((v) => '<div class="ver"><span class="tag">' + (SRC[v.source] || v.source) + '</span><span class="grow">'
    + new Date(v.created_at).toLocaleString('vi') + ' · ' + v.chars.toLocaleString('vi') + ' ký tự' + (v.tokens_in ? ' · ' + v.tokens_in + '/' + v.tokens_out + ' token' : '')
    + '</span><button data-v="' + v.id + '">Nạp</button></div>').join('') || '<div class="note">Chưa có phiên bản nào được lưu.</div>';
  $('vers').querySelectorAll('button[data-v]').forEach((b) => b.onclick = async () => {
    const v = await (await fetch('/api/page-versions/' + b.dataset.v)).json();
    code.value = v.html;
    if (v.prompt) { psys.value = v.prompt.system; puser.value = v.prompt.user; }
    say('Đã nạp phiên bản ' + new Date(v.created_at).toLocaleString('vi') + ' (chưa lưu)');
  });
  return d;
}
function track(r) {
  if (r && r.running) {
    busy(true); say('LLM đang gen lại… (1–5 phút, có thể đóng trang này)');
    clearTimeout(poll); poll = setTimeout(checkRegen, 4000);
  } else if (r && r.doneAt) {
    busy(false);
    if (r.error) say('Gen lại lỗi: ' + r.error, 'err');
    else { say('Đã gen lại & chụp ' + r.shots + ' ảnh', 'ok'); frame.src = view + '?t=' + Date.now(); }
  }
}
async function checkRegen() {
  try { const d = await load(false); track(d.regen); if (d.regen && !d.regen.running && !d.regen.error) code.value = d.html; }
  catch { poll = setTimeout(checkRegen, 8000); }
}
async function post(path, body, label) {
  busy(true); say(label);
  try {
    const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  } catch (e) { say(e.message, 'err'); return null; } finally { busy(false); }
}
$('preview').onclick = async () => { const d = await post('/preview', { html: code.value }, 'Đang dựng…'); if (d) { frame.src = d.url; say('Bản xem trước (chưa lưu)'); } };
$('save').onclick = async () => {
  const d = await post('', { html: code.value }, 'Đang lưu và chụp lại… (~10–20 giây)');
  if (d) { saved = code.value; frame.src = view + '?t=' + Date.now(); say('Đã lưu, chụp lại ' + d.shots + ' ảnh', 'ok'); load(false); }
};
$('reset').onclick = () => { code.value = saved; say('Đã hoàn tác HTML về bản đã lưu'); };
$('presetp').onclick = () => { psys.value = savedPrompt.system; puser.value = savedPrompt.user; say('Đã hoàn tác prompt'); };
$('regen').onclick = async () => {
  if (code.value !== saved && !confirm('HTML đang sửa dở chưa lưu sẽ bị thay bằng bản LLM gen lại. Tiếp tục?')) return;
  const d = await post('/regenerate', { system: psys.value, user: puser.value }, 'Đang gửi prompt…');
  if (d) { savedPrompt = { system: psys.value, user: puser.value }; track(d.regen); }
};
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); $('save').click(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('preview').click(); }
});
code.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = code.selectionStart; code.setRangeText('  ', s, code.selectionEnd, 'end'); } });
window.addEventListener('beforeunload', (e) => { if (code.value !== saved) e.preventDefault(); });
load(true).then((d) => track(d.regen)).catch((e) => say('Không tải được: ' + e.message, 'err'));
</script></html>`);
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
  const credits = await resolvePageMedia(pool, sections, {});
  return reply.header('Content-Security-Policy', DEMO_CSP).type('text/html; charset=utf-8')
    .send(renderPage({ plan, page: p, sections, lead: SAMPLE.lead, credits, brandSvg: await illustration(pool, plan.brand.illustration) }));
});

// ---------- trang duyệt ----------
app.get('/', async (req, reply) => reply.type('text/html; charset=utf-8').send(await fs.readFile(path.join(PUBLIC_DIR, 'index.html'))));

// Bản nháp kẹt ở "generating" do service khởi động lại → đánh dấu lỗi
await pool.query(`UPDATE outreach SET status = 'failed', error = 'service khởi động lại giữa chừng' WHERE status = 'generating'`).catch(() => {});
await app.listen({ host: '0.0.0.0', port: PORT });
