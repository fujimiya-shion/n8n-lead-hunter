// Tạo bộ demo cho 1 lead, 2 tab song song:
//   • "llm"     — MiMo tự viết HTML (Tailwind) cho từng màn hình theo skill front-end (skills/frontend-design.md)
//   • "generic" — thư viện thành phần có sẵn (phương án dự phòng cuối cùng)
// Màn hình: trang chủ (page) + các màn hình section/modal do LLM chọn theo ngành.
// Mỗi màn hình: dựng HTML → ghi file tạm → Playwright chụp → XOÁ file tạm. Chỉ giữ ảnh chụp + nội dung để dựng lại.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, parseJson, MODEL, JUDGE_MODEL } from './llm.js';
import { planMessages, pageMessages, llmScreensMessages, htmlPrompt, withSkill, judgeMessages, CLICHES } from './prompts.js';
import { normalizePlan, normalizePage, normalizeScreens } from './spec.js';
import { renderPage, renderSections } from './components.js';
import { resolvePageMedia, illustration, shopPhoto } from './images.js';
import { buildLlmPage } from './llmhtml.js';
import { oldSiteUrl, analyzeOldSite, oldSiteBrief, sitePhotoUrls } from './oldsite.js';
import { shootPage } from './screenshot.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const PORT = process.env.PORT || 8082;
const SKILL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'frontend-design.md');
export const shotsDir = (outreachId) => path.join(DATA_DIR, 'shots', String(outreachId));
export const tmpDir = () => path.join(DATA_DIR, 'tmp');

const RETRY_NOTE = 'Lần trước câu trả lời bị hỏng (viết kế hoạch bằng chữ, dừng giữa chừng, thiếu header/footer, hoặc quá dài nên bị cắt). '
  + 'Viết lại: bắt đầu NGAY bằng thẻ HTML, không một chữ giải thích nào, gọn hơn (tối đa 7 khối data-section cho trang chủ, 1–3 khối cho section/modal).';

async function setting(pool, key, fallback) {
  const r = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return r.rows[0]?.value ?? fallback;
}

async function loadLead(pool, businessId) {
  const r = await pool.query(
    `SELECT a.*, b.category, b.address FROM a_leads a JOIN businesses b ON b.id = a.id WHERE a.id = $1`, [businessId]);
  if (!r.rows[0]) throw new Error(`Không tìm thấy lead ${businessId}`);
  return r.rows[0];
}

/**
 * Các demo gần đây, rút gọn thành "những thứ đã dùng nhiều" để LLM tránh lặp.
 * KHÔNG liệt kê thứ tự khối của từng bản (liệt kê nguyên khung dễ làm LLM bắt chước theo).
 *   brand  → đưa vào prompt PLAN (phong cách / font / màu)
 *   layout → đưa vào prompt HTML trang chủ (chỉ kiểu mở đầu trang nếu bị lặp nhiều)
 */
async function recentDesigns(pool, n = 6) {
  const r = await pool.query(
    `SELECT site_plan->'brand' AS brand, llm_pages FROM outreach
     WHERE status NOT IN ('failed','generating') AND site_plan IS NOT NULL ORDER BY created_at DESC LIMIT $1`, [n]);
  if (!r.rows.length) return { brand: '', layout: '' };
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const brands = r.rows.map((x) => x.brand || {});
  const last = brands[0];
  const brand = `bản gần nhất: hướng nghệ thuật ${last.direction || '—'}, phong cách ${last.style}, font tiêu đề ${last.font_heading}, màu chính ${last.colors?.primary} → bản này phải khác cả 4. `
    + `Hướng nghệ thuật đã dùng gần đây: ${uniq(brands.map((b) => b.direction)).join(', ') || 'chưa có'}. `
    + `Đã dùng gần đây — phong cách: ${uniq(brands.map((b) => b.style)).join(', ')}; font tiêu đề: ${uniq(brands.map((b) => b.font_heading)).join(', ')}; `
    + `màu chính: ${uniq(brands.map((b) => b.colors?.primary)).join(', ')}. Ưu tiên lựa chọn chưa dùng.`;
  const kinds = r.rows.map((x) => {
    const home = (x.llm_pages || []).find((p) => p.kind === 'page');
    const hero = home ? (/data-section\s*=\s*["']hero["'][^>]*>([\s\S]{0,1500})/i.exec(home.html)?.[1] || '') : '';
    return !home ? null : /lg:grid-cols-12|lg:grid-cols-2|md:grid-cols-2/.test(hero) ? 'hero chia 2 cột chữ trái / ảnh phải'
      : /absolute inset-0[^"]*object-cover|bg-cover/.test(hero) ? 'hero ảnh tràn nền' : null;
  }).filter(Boolean);
  const counts = kinds.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const layout = top && top[1] >= 3
    ? `LƯU Ý: ${top[1]}/${r.rows.length} demo gần đây đều mở trang chủ bằng "${top[0]}". Lần này hãy mở đầu trang theo cách khác, hợp với nghiệp vụ của doanh nghiệp này.`
    : '';
  return { brand, layout };
}

/** Trừ điểm "giọng AI / quảng cáo" bằng luật đơn giản */
function humanPenalty(message) {
  const low = message.toLowerCase();
  const issues = [];
  let p = 0;
  for (const c of CLICHES) if (low.includes(c)) { p += 15; issues.push(`Cụm sáo rỗng: "${c}"`); }
  const emojis = (message.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emojis > 2) { p += 10; issues.push(`Nhiều emoji (${emojis})`); }
  if (message.length > 700) { p += 10; issues.push(`Tin nhắn dài (${message.length} ký tự)`); }
  if (message.length < 150) { p += 10; issues.push('Tin nhắn quá ngắn'); }
  return { p, issues };
}

/** Chạy các hàm async với giới hạn số việc cùng lúc; trả về kết quả kiểu allSettled theo đúng thứ tự */
async function limited(fns, n) {
  const out = new Array(fns.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, fns.length) }, async () => {
    while (next < fns.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await fns[i]() }; } catch (e) { out[i] = { status: 'rejected', reason: e }; }
    }
  }));
  return out;
}

/** Ghi HTML ra file tạm → chụp → xoá */
export async function shootHtml(html, { id, view, track }) {
  await fs.mkdir(tmpDir(), { recursive: true });
  const name = `${id}-${track}-${view.slug}-${Date.now()}`;
  const file = path.join(tmpDir(), `${name}.html`);
  await fs.writeFile(file, html, 'utf8');
  try {
    const dir = shotsDir(id);
    await fs.mkdir(dir, { recursive: true });
    return await shootPage(`http://127.0.0.1:${PORT}/render/${name}`, dir, view.slug, view.title, { view: view.kind, track });
  } finally {
    await fs.rm(file, { force: true });
  }
}

export async function generateForLead(pool, businessId) {
  await pool.query(
    `UPDATE outreach SET status = 'skipped', updated_at = now(), error = 'thay bằng bản tạo lại'
     WHERE business_id = $1 AND status IN ('generating','draft','approved')`, [businessId]);
  const id = (await pool.query(
    `INSERT INTO outreach (business_id, status, model, template) VALUES ($1, 'generating', $2, 'two-track-v1') RETURNING id`,
    [businessId, MODEL])).rows[0].id;

  let tokensIn = 0, tokensOut = 0;
  const track = (r) => { tokensIn += r.tokensIn || 0; tokensOut += r.tokensOut || 0; return r; };
  const askJson = async (messages, maxTokens) => {
    const r = track(await chat({ messages, maxTokens, temperature: 0.8, json: true }));
    try { return parseJson(r.content); } catch { throw new Error(`LLM trả về JSON không hợp lệ (finish_reason=${r.finishReason})`); }
  };
  const askHtml = async (messages, retryNote = '') => {
    const msgs = retryNote ? [...messages, { role: 'user', content: retryNote }] : messages;
    const r = track(await chat({ messages: msgs, maxTokens: 14000, temperature: 0.7, timeoutMs: 420000 }));
    return { html: r.content, cut: r.finishReason === 'length' };
  };

  try {
    const lead = await loadLead(pool, businessId);
    const sender = { name: await setting(pool, 'outreach_sender_name', 'em'), intro: await setting(pool, 'outreach_sender_intro', 'em làm website') };
    const maxPages = Math.max(1, Math.min(6, Number(await setting(pool, 'outreach_max_pages', 4)) || 4));
    const concurrency = Math.max(1, Math.min(8, Number(await setting(pool, 'outreach_llm_concurrency', 4)) || 4));
    const skill = await fs.readFile(SKILL_FILE, 'utf8');
    const recent = await recentDesigns(pool).catch(() => ({ brand: '', layout: '' }));
    // Tab generic: on = luôn chạy · fallback = chỉ khi tab LLM hỏng hết (mặc định, tiết kiệm token) · off = tắt
    const genericMode = ['on', 'off', 'fallback'].includes(await setting(pool, 'outreach_generic_track', 'fallback'))
      ? await setting(pool, 'outreach_generic_track', 'fallback') : 'fallback';
    const photo = await shopPhoto(pool, businessId).catch(() => null);
    // Web cũ còn sống → fetch HTML + 1 lần LLM phân tích (cache 30 ngày) → làm bản "làm mới" thay vì thiết kế từ con số 0
    const prompts = {};
    const preIssues = [];
    let old = null;
    if (String(await setting(pool, 'outreach_old_site', 'true')) !== 'false' && oldSiteUrl(lead)) {
      try {
        const r = await analyzeOldSite(pool, lead, askJson);
        if (r) { old = r.analysis; if (r.prompt) prompts.oldsite = r.prompt; }
      } catch (e) { preIssues.push(`Không đọc được web cũ (${String(e.message || e).slice(0, 80)}) → thiết kế mới hoàn toàn`); }
    }
    const oldSite = old ? {
      brief: oldSiteBrief(old), briefWithPhotos: oldSiteBrief(old, { withPhotos: true }),
      primary: /^#[0-9a-f]{6}$/i.test(old.brand?.primary || '') ? old.brand.primary : '',
    } : null;
    const imgCtx = {
      industry: `${lead.name} (${lead.industry})`, // tên giúp MiMo duyệt ảnh đúng nghiệp vụ thật
      check: String(await setting(pool, 'outreach_image_check', 'true')) !== 'false',
      minFit: Number(await setting(pool, 'outreach_image_min_fit', 60)) || 60,
      shopPhoto: photo,
      sitePhotos: old?.photo_urls || [],
      onTokens: track,
    };

    // 1) Kế hoạch: tin nhắn + thương hiệu. Danh sách trang của template generic chỉ xin khi tab generic bật "on".
    prompts.plan = planMessages(lead, sender, maxPages, recent.brand, { withPages: genericMode === 'on', oldSite });
    const plan = normalizePlan(await askJson(prompts.plan, 4000), maxPages);
    if (!plan.message) throw new Error('LLM không trả về tin nhắn');
    let views = plan.pages;
    await fs.rm(shotsDir(id), { recursive: true, force: true });
    const brandSvg = await illustration(pool, plan.brand.illustration);

    // 2) Tab "LLM tự thiết kế": LLM TỰ QUYẾT bộ màn hình (độc lập với kế hoạch của template generic)
    let screens = [];
    prompts.screens = llmScreensMessages(lead, maxPages, { oldSite });
    try { screens = normalizeScreens(await askJson(prompts.screens, 2500), maxPages); }
    catch (e) { /* không lên được danh sách màn hình → tab LLM trống, tab generic vẫn chạy */ }

    // 3) Lời gọi LLM chạy song song (giới hạn `concurrency`): HTML từng màn hình của LLM (+ nội dung generic nếu bật "on")
    const htmlOpts = { hasShopPhoto: Boolean(photo), recent: recent.layout, oldSite };
    const promptOf = (sc) => htmlPrompt(lead, plan.brand, sc, screens, htmlOpts); // lưu vào DB, sửa được trên trang 8082
    const genericCalls = () => views.map((v) => () => askJson(pageMessages(lead, plan, v), 12000));
    const results = await limited([
      ...screens.map((sc) => () => askHtml(withSkill(skill, promptOf(sc)))),
      ...(genericMode === 'on' ? genericCalls() : []),
    ], concurrency);
    const llmRes = results.slice(0, screens.length);
    let genRes = results.slice(screens.length);

    // 4) Dựng + chụp lần lượt — mỗi tab theo danh sách màn hình của riêng nó
    const shots = [], summaries = [], issues = [...preIssues], genericPages = [], llmPages = [];
    for (const [i, screen] of screens.entries()) {
      try {
        let res = llmRes[i].status === 'fulfilled' ? llmRes[i].value : null;
        let html, lastErr = '';
        for (let attempt = 0; attempt < 2 && !html; attempt++) {
          try {
            if (!res) res = await askHtml(withSkill(skill, promptOf(screen)), attempt ? `${RETRY_NOTE} Lỗi cụ thể: ${lastErr}.` : '');
            if (res.cut && attempt === 0) throw new Error('HTML bị cắt do quá dài'); // lần đầu bị cắt → gọi lại bản gọn hơn
            html = await buildLlmPage(pool, { raw: res.html, plan, view: screen, lead, brandSvg, ctx: imgCtx });
          } catch (e) {
            if (attempt === 1) throw e;
            lastErr = String(e.message || e).slice(0, 160);
            res = null; // thử lại kèm lời nhắc
          }
        }
        const r = await shootHtml(html, { id, view: screen, track: 'llm' });
        shots.push(...r.shots);
        llmPages.push({ ...screen, html: res.html, truncated: res.cut, prompt: promptOf(screen) });
        summaries.push(`[${screen.title} · ${screen.kind}]\n${r.summary}`);
        if (res.cut) issues.push(`HTML màn hình "${screen.title}" bị cắt do quá dài`);
      } catch (e) {
        issues.push(`LLM không thiết kế được "${screen.title}": ${String(e.message).slice(0, 100)}`);
      }
    }
    let homeBody = '';
    if (genericMode === 'on' || (genericMode === 'fallback' && !llmPages.length)) {
      if (!views.length) { // fallback: plan chưa có danh sách trang → xin riêng (chỉ khi tab LLM hỏng hết)
        try { views = normalizePlan(await askJson(planMessages(lead, sender, maxPages, '', { withPages: true }), 4000), maxPages).pages; } catch { views = []; }
      }
      if (!genRes.length) genRes = await limited(genericCalls(), concurrency); // fallback: tab LLM hỏng hết → mới tốn token cho generic
      for (const [i, view] of views.entries()) {
        try {
          if (genRes[i].status === 'rejected') throw genRes[i].reason;
          const sections = normalizePage(genRes[i].value, view);
          const credits = await resolvePageMedia(pool, sections, imgCtx);
          if (view.kind === 'page') homeBody = renderSections({ plan, sections, lead, credits, brandSvg });
          const html = renderPage({ plan, page: view, sections, lead, credits, brandSvg, homeBody });
          const r = await shootHtml(html, { id, view, track: 'generic' });
          shots.push(...r.shots);
          genericPages.push({ ...view, credits, sections: sections.map(({ illustrationSvg, ...s }) => s) });
          if (!llmPages.length) summaries.push(`[${view.title} · ${view.kind}]\n${r.summary}`);
        } catch (e) {
          if (i === 0) issues.push(`Template generic lỗi trang chủ: ${String(e.message).slice(0, 100)}`);
        }
      }
    }
    if (!shots.length) throw new Error(`Không chụp được màn hình nào. ${issues.join(' · ')}`);

    // 5) Chấm điểm (ưu tiên bản LLM tự thiết kế)
    prompts.judge = judgeMessages(lead, plan.message, summaries.join('\n\n'), { oldSite });
    const jr = track(await chat({ model: JUDGE_MODEL, messages: prompts.judge, maxTokens: 1500, temperature: 0, json: true }));
    let judge;
    try { judge = parseJson(jr.content); } catch { judge = { human_score: 50, fit_score: 50, issues: ['Không đọc được kết quả chấm điểm'] }; }
    const hp = humanPenalty(plan.message);
    const fitPenalty = (screens.length - llmPages.length) * 10 + (llmPages.length ? 0 : 20);
    const leadScore = Math.min(Number(lead.score) || 0, 100);
    const human = Math.max(0, Math.min(100, Math.round(Number(judge.human_score) || 0) - hp.p));
    const fit = Math.max(0, Math.min(100, Math.round(Number(judge.fit_score) || 0) - fitPenalty));
    const confidence = Math.round(0.4 * leadScore + 0.3 * human + 0.3 * fit);
    // model chấm hay nhầm chữ ký cuối tin nhắn là "bị cắt" → bỏ cảnh báo đó
    const sig = String(sender.name || '').toLowerCase();
    const judgeIssues = (Array.isArray(judge.issues) ? judge.issues : []).map(String)
      .filter((x) => !(/chữ ký|ký tên|cắt cụt|bị cắt|dở dang/i.test(x) && (!sig || x.toLowerCase().includes(sig) || /chữ ký|ký tên/i.test(x))));
    const allIssues = [...judgeIssues, ...hp.issues, ...issues].slice(0, 6);

    await pool.query(
      `UPDATE outreach SET status = 'draft', message = $2, message_original = $2, demo_title = $3,
         lead_score = $4, human_score = $5, fit_score = $6, confidence = $7, judge_issues = $8,
         tokens_in = $9, tokens_out = $10, site_plan = $11, pages = $12, llm_pages = $13, shots = $14, prompts = $15, error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, plan.message, (llmPages.length ? llmPages : views).map((p) => p.title).join(' · '), leadScore, human, fit, confidence, JSON.stringify(allIssues),
        tokensIn, tokensOut, JSON.stringify({ ...plan, llm_screens: screens, old_site: old ? { url: old.url, via: old.via } : null }), JSON.stringify(genericPages), JSON.stringify(llmPages), JSON.stringify(shots), JSON.stringify(prompts)]);
    for (const p of llmPages) {
      await pool.query(`INSERT INTO page_versions (outreach_id, slug, source, prompt, html) VALUES ($1, $2, 'llm', $3, $4)`,
        [id, p.slug, JSON.stringify(p.prompt), p.html]);
    }
    return id;
  } catch (e) {
    await pool.query(`UPDATE outreach SET status = 'failed', error = $2, tokens_in = $3, tokens_out = $4, updated_at = now() WHERE id = $1`,
      [id, String(e.message || e).slice(0, 1000), tokensIn, tokensOut]);
    throw e;
  }
}


// ---------- sửa 1 màn hình sau khi đã tạo (trang 8082): sửa tay HTML hoặc chỉnh prompt rồi gen lại ----------
async function loadLeadOf(pool, o) { return loadLead(pool, o.business_id); }

/** Dựng HTML hoàn chỉnh từ HTML thô của 1 màn hình đã lưu (không gọi LLM viết) */
export async function buildStoredPage(pool, o, lead, page, raw) {
  const ctx = {
    industry: `${lead.name} (${lead.industry})`, check: true, minFit: 60,
    shopPhoto: await shopPhoto(pool, o.business_id).catch(() => null), sitePhotos: await sitePhotoUrls(pool, o.business_id),
  };
  return buildLlmPage(pool, { raw, plan: o.site_plan, view: page, lead, brandSvg: await illustration(pool, o.site_plan?.brand?.illustration), ctx });
}

export async function loadStoredPage(pool, id, slug) {
  const o = (await pool.query(`SELECT id, business_id, status, site_plan, llm_pages, shots FROM outreach WHERE id = $1`, [Number(id)])).rows[0];
  const idx = o ? (o.llm_pages || []).findIndex((p) => p.slug === slug) : -1;
  if (idx < 0) return null;
  return { o, idx, page: o.llm_pages[idx], lead: await loadLeadOf(pool, o) };
}

/**
 * Thay HTML của 1 màn hình: kiểm tra → Playwright chụp lại → thay ảnh cũ đúng vị trí → lưu llm_pages + 1 dòng page_versions.
 * Lỗi kiểm tra HTML ném ra có e.status = 400.
 */
export async function replacePageHtml(pool, x, raw, { source, prompt = null, tokensIn = null, tokensOut = null }) {
  let html;
  try { html = await buildStoredPage(pool, x.o, x.lead, x.page, raw); } catch (e) { e.status = 400; throw e; }
  const r = await shootHtml(html, { id: x.o.id, view: x.page, track: 'llm' }); // tên file có timestamp → không đè ảnh cũ
  // đọc lại bản mới nhất (tránh ghi đè thay đổi xảy ra trong lúc chụp)
  const cur = (await pool.query(`SELECT llm_pages, shots FROM outreach WHERE id = $1`, [x.o.id])).rows[0];
  const isOld = (s) => (s.track || 'generic') === 'llm' && s.page === x.page.slug;
  const old = (cur.shots || []).filter(isOld);
  const shots = [];
  let inserted = false;
  for (const s of cur.shots || []) {
    if (isOld(s)) { if (!inserted) { shots.push(...r.shots); inserted = true; } } else shots.push(s);
  }
  if (!inserted) shots.push(...r.shots);
  const now = new Date().toISOString();
  const pages = cur.llm_pages.map((p) => (p.slug === x.page.slug
    ? { ...p, html: raw, truncated: false, ...(prompt ? { prompt } : {}), [source === 'regen' ? 'regenerated_at' : 'edited_at']: now } : p));
  await pool.query(
    `UPDATE outreach SET llm_pages = $2, shots = $3, updated_at = now(),
       tokens_in = coalesce(tokens_in, 0) + $4, tokens_out = coalesce(tokens_out, 0) + $5 WHERE id = $1`,
    [x.o.id, JSON.stringify(pages), JSON.stringify(shots), tokensIn || 0, tokensOut || 0]);
  await pool.query(
    `INSERT INTO page_versions (outreach_id, slug, source, prompt, html, tokens_in, tokens_out) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [x.o.id, x.page.slug, source, prompt ? JSON.stringify(prompt) : null, raw, tokensIn, tokensOut]);
  const keep = new Set(r.shots.map((s) => s.file));
  for (const s of old) if (!keep.has(s.file)) await fs.rm(path.join(shotsDir(x.o.id), s.file), { force: true });
  return { shots: r.shots.length };
}

/** Gửi lại prompt (đã chỉnh) cho LLM → HTML mới → chụp lại. Skill luôn lấy bản mới nhất trong file. */
export async function regeneratePage(pool, x, prompt) {
  const skill = await fs.readFile(SKILL_FILE, 'utf8');
  let tIn = 0, tOut = 0, lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs = withSkill(skill, prompt);
    if (attempt) msgs.push({ role: 'user', content: `${RETRY_NOTE} Lỗi cụ thể: ${lastErr}.` });
    const r = await chat({ messages: msgs, maxTokens: 14000, temperature: 0.7, timeoutMs: 420000 });
    tIn += r.tokensIn || 0; tOut += r.tokensOut || 0;
    try {
      if (r.finishReason === 'length' && attempt === 0) throw new Error('HTML bị cắt do quá dài');
      return await replacePageHtml(pool, x, r.content, { source: 'regen', prompt, tokensIn: tIn, tokensOut: tOut });
    } catch (e) {
      if (e.status !== 400 && !/bị cắt/.test(e.message)) throw e; // lỗi chụp/DB → không gọi lại LLM
      if (attempt === 1) throw e;
      lastErr = String(e.message || e).slice(0, 160);
    }
  }
}

export async function skillInfo() {
  const s = await fs.readFile(SKILL_FILE, 'utf8');
  return { chars: s.length, text: s };
}
