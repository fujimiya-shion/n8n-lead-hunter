// Tạo bộ demo cho 1 lead, 2 tab song song:
//   • "llm"     — MiMo tự viết HTML (Tailwind) cho từng màn hình theo skill front-end (skills/frontend-design.md)
//   • "generic" — thư viện thành phần có sẵn (phương án dự phòng cuối cùng)
// Màn hình: trang chủ (page) + các màn hình section/modal do LLM chọn theo ngành.
// Mỗi màn hình: dựng HTML → ghi file tạm → Playwright chụp → XOÁ file tạm. Chỉ giữ ảnh chụp + nội dung để dựng lại.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, parseJson, MODEL, JUDGE_MODEL } from './llm.js';
import { planMessages, pageMessages, llmScreensMessages, htmlMessages, judgeMessages, CLICHES } from './prompts.js';
import { normalizePlan, normalizePage, normalizeScreens } from './spec.js';
import { renderPage, renderSections } from './components.js';
import { resolvePageMedia, illustration } from './images.js';
import { buildLlmPage } from './llmhtml.js';
import { shootPage } from './screenshot.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const PORT = process.env.PORT || 8082;
const SKILL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'frontend-design.md');
export const shotsDir = (outreachId) => path.join(DATA_DIR, 'shots', String(outreachId));
export const tmpDir = () => path.join(DATA_DIR, 'tmp');

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
  const RETRY_NOTE = 'Lần trước câu trả lời bị hỏng (viết kế hoạch bằng chữ hoặc quá dài nên bị cắt). '
    + 'Viết lại: bắt đầu NGAY bằng thẻ HTML, không một chữ giải thích nào, gọn hơn (tối đa 7 khối data-section cho trang chủ, 1–3 khối cho section/modal).';

  try {
    const lead = await loadLead(pool, businessId);
    const sender = { name: await setting(pool, 'outreach_sender_name', 'em'), intro: await setting(pool, 'outreach_sender_intro', 'em làm website') };
    const maxPages = Math.max(1, Math.min(6, Number(await setting(pool, 'outreach_max_pages', 4)) || 4));
    const concurrency = Math.max(1, Math.min(8, Number(await setting(pool, 'outreach_llm_concurrency', 4)) || 4));
    const skill = await fs.readFile(SKILL_FILE, 'utf8');

    // 1) Kế hoạch: tin nhắn + thương hiệu (1 phong cách cho cả bộ) + danh sách màn hình
    const plan = normalizePlan(await askJson(planMessages(lead, sender, maxPages), 4000), maxPages);
    if (!plan.message) throw new Error('LLM không trả về tin nhắn');
    if (!plan.pages.length) throw new Error('LLM không lên được kế hoạch màn hình nào');
    const views = plan.pages;
    await fs.rm(shotsDir(id), { recursive: true, force: true });
    const brandSvg = await illustration(pool, plan.brand.illustration);

    // 2) Tab "LLM tự thiết kế": LLM TỰ QUYẾT bộ màn hình (độc lập với kế hoạch của template generic)
    let screens = [];
    try { screens = normalizeScreens(await askJson(llmScreensMessages(lead, maxPages), 2500), maxPages); }
    catch (e) { /* không lên được danh sách màn hình → tab LLM trống, tab generic vẫn chạy */ }

    // 3) Mọi lời gọi LLM chạy song song (giới hạn `concurrency`): HTML từng màn hình của LLM + nội dung JSON của generic
    const results = await limited([
      ...screens.map((sc) => () => askHtml(htmlMessages(lead, plan.brand, sc, screens, skill))),
      ...views.map((v) => () => askJson(pageMessages(lead, plan, v), 12000)),
    ], concurrency);
    const llmRes = results.slice(0, screens.length);
    const genRes = results.slice(screens.length);

    // 4) Dựng + chụp lần lượt — mỗi tab theo danh sách màn hình của riêng nó
    const shots = [], summaries = [], issues = [], genericPages = [], llmPages = [];
    let homeBody = '';
    for (const [i, view] of views.entries()) {
      try {
        if (genRes[i].status === 'rejected') throw genRes[i].reason;
        const sections = normalizePage(genRes[i].value, view);
        const credits = await resolvePageMedia(pool, sections, Number(id));
        if (view.kind === 'page') homeBody = renderSections({ plan, sections, lead, credits, brandSvg });
        const html = renderPage({ plan, page: view, sections, lead, credits, brandSvg, homeBody });
        const r = await shootHtml(html, { id, view, track: 'generic' });
        shots.push(...r.shots);
        genericPages.push({ ...view, credits, sections: sections.map(({ illustrationSvg, ...s }) => s) });
        if (!screens.length) summaries.push(`[${view.title} · ${view.kind}]\n${r.summary}`);
      } catch (e) {
        if (i === 0) issues.push(`Template generic lỗi trang chủ: ${String(e.message).slice(0, 100)}`);
      }
    }
    for (const [i, screen] of screens.entries()) {
      try {
        let res = llmRes[i].status === 'fulfilled' ? llmRes[i].value : null;
        let html;
        for (let attempt = 0; attempt < 2 && !html; attempt++) {
          try {
            if (!res) res = await askHtml(htmlMessages(lead, plan.brand, screen, screens, skill), attempt ? RETRY_NOTE : '');
            if (res.cut && attempt === 0) throw new Error('HTML bị cắt do quá dài'); // lần đầu bị cắt → gọi lại bản gọn hơn
            html = await buildLlmPage(pool, { raw: res.html, plan, view: screen, lead, seed: Number(id) + 7, brandSvg });
          } catch (e) {
            if (attempt === 1) throw e;
            res = null; // thử lại kèm lời nhắc
          }
        }
        const r = await shootHtml(html, { id, view: screen, track: 'llm' });
        shots.push(...r.shots);
        llmPages.push({ ...screen, html: res.html, truncated: res.cut });
        summaries.push(`[${screen.title} · ${screen.kind}]\n${r.summary}`);
        if (res.cut) issues.push(`HTML màn hình "${screen.title}" bị cắt do quá dài`);
      } catch (e) {
        issues.push(`LLM không thiết kế được "${screen.title}": ${String(e.message).slice(0, 100)}`);
      }
    }
    if (!shots.length) throw new Error(`Không chụp được màn hình nào. ${issues.join(' · ')}`);

    // 5) Chấm điểm (ưu tiên bản LLM tự thiết kế)
    const jr = track(await chat({ model: JUDGE_MODEL, messages: judgeMessages(lead, plan.message, summaries.join('\n\n')), maxTokens: 1500, temperature: 0, json: true }));
    let judge;
    try { judge = parseJson(jr.content); } catch { judge = { human_score: 50, fit_score: 50, issues: ['Không đọc được kết quả chấm điểm'] }; }
    const hp = humanPenalty(plan.message);
    const fitPenalty = (screens.length - llmPages.length) * 10 + (screens.length ? 0 : 20);
    const leadScore = Math.min(Number(lead.score) || 0, 100);
    const human = Math.max(0, Math.min(100, Math.round(Number(judge.human_score) || 0) - hp.p));
    const fit = Math.max(0, Math.min(100, Math.round(Number(judge.fit_score) || 0) - fitPenalty));
    const confidence = Math.round(0.4 * leadScore + 0.3 * human + 0.3 * fit);
    const allIssues = [...(Array.isArray(judge.issues) ? judge.issues : []), ...hp.issues, ...issues].slice(0, 6);

    await pool.query(
      `UPDATE outreach SET status = 'draft', message = $2, message_original = $2, demo_title = $3,
         lead_score = $4, human_score = $5, fit_score = $6, confidence = $7, judge_issues = $8,
         tokens_in = $9, tokens_out = $10, site_plan = $11, pages = $12, llm_pages = $13, shots = $14, error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, plan.message, views.map((p) => p.title).join(' · '), leadScore, human, fit, confidence, JSON.stringify(allIssues),
        tokensIn, tokensOut, JSON.stringify({ ...plan, llm_screens: screens }), JSON.stringify(genericPages), JSON.stringify(llmPages), JSON.stringify(shots)]);
    return id;
  } catch (e) {
    await pool.query(`UPDATE outreach SET status = 'failed', error = $2, tokens_in = $3, tokens_out = $4, updated_at = now() WHERE id = $1`,
      [id, String(e.message || e).slice(0, 1000), tokensIn, tokensOut]);
    throw e;
  }
}
