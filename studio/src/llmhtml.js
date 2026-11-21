// Xử lý HTML do LLM tự viết (tab "LLM tự thiết kế"):
// làm sạch (bỏ script/sự kiện/iframe/emoji) → đổi <i data-lucide> thành SVG → gắn ảnh thật cho <img data-query> → bọc vào khung chung.
import { icon } from './icons.js';
import { pickPhoto, sitePhoto } from './images.js';
import { shell } from './brand.js';

const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i')) || tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, 'i')) || [])[1];

/** Lấy phần thân HTML từ câu trả lời của LLM và làm sạch */
const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'stop', 'use']);
/** Bỏ chữ nằm lơ lửng ngoài mọi thẻ (vd "... (full page HTML follows)") — nội dung thật luôn nằm trong thẻ */
function dropTopLevelText(h) {
  let depth = 0, out = '', i = 0;
  const re = /<\/?([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(h))) {
    const text = h.slice(i, m.index);
    if (depth > 0) out += text;
    const name = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    const selfClose = m[2] === '/' || VOID.has(name);
    out += m[0];
    if (closing) depth = Math.max(0, depth - 1); else if (!selfClose) depth++;
    i = re.lastIndex;
  }
  if (depth > 0) out += h.slice(i);
  return out;
}

export function cleanHtml(raw) {
  let h = String(raw || '').replace(/```(?:html)?/gi, '').trim();
  const body = h.match(/<body[^>]*>([\s\S]*?)(?:<\/body>|$)/i);
  if (body) h = body[1];
  // Bỏ mọi chữ LLM viết trước thẻ HTML đầu tiên (kế hoạch, "Let me...") và sau thẻ đóng cuối cùng
  const first = h.search(/<(header|section|main|nav|div|article|aside|footer|form|!--)\b/i);
  h = first >= 0 ? h.slice(first) : '';
  const last = h.lastIndexOf('>');
  if (last >= 0) h = h.slice(0, last + 1);
  h = h.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<\/?html[^>]*>/gi, '').replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?(-->|$)/g, '');
  h = dropTopLevelText(h);
  // không cho chạy mã: bỏ script, sự kiện, nhúng ngoài, link javascript:
  h = h.replace(/<script[\s\S]*?(<\/script>|$)/gi, '')
    .replace(/<(iframe|object|embed|link|meta|base|frame|frameset)\b[^>]*>(<\/\1>)?/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  // không emoji
  h = h.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu, '');
  // icon Lucide → SVG thật (tên lạ → icon dự phòng)
  h = h.replace(/<i\b([^>]*\bdata-lucide\s*=\s*["']([a-z0-9-]+)["'][^>]*)>\s*<\/i>/gi, (_, attrs, name) => icon(name, attr(` ${attrs}`, 'class') || 'h-5 w-5', 'circle'));
  return h;
}

/** Gắn ảnh thật cho mọi <img data-query>; không có ảnh → khối màu thương hiệu có minh hoạ (không để ô xám trống) */
export async function resolveHtmlImages(pool, html, { brandSvg = null, monogram = '', ctx = {} } = {}) {
  const used = new Set();
  const credits = new Set();
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  let out = html;
  let shopUsed = false;
  for (const tag of tags) {
    const q = attr(tag, 'data-query');
    const src = attr(tag, 'src');
    const cls = attr(tag, 'class') || '';
    const alt = attr(tag, 'alt') || '';
    let rep;
    const wantShop = /\bdata-shop-photo\b/i.test(tag);
    const siteN = Number(attr(tag, 'data-site-photo'));
    const siteUrl = siteN >= 1 ? (ctx.sitePhotos || [])[siteN - 1] : null;
    const siteData = siteUrl ? await sitePhoto(siteUrl) : null;
    if (siteData) {
      // ảnh thật lấy từ website cũ của khách
      rep = `<img src="${escAttr(siteData)}" alt="${escAttr(alt)}" class="${escAttr(cls)}" loading="eager">`;
    } else if (wantShop && ctx.shopPhoto && !shopUsed) {
      // ảnh thật của shop (Google Maps / fanpage) — dùng 1 lần, ở vị trí LLM chọn
      shopUsed = true;
      rep = `<img src="${escAttr(ctx.shopPhoto)}" alt="${escAttr(alt)}" class="${escAttr(cls)}" loading="eager">`;
    } else if (q || wantShop || siteN) {
      const url = await pickPhoto(pool, q || alt, { used, credits, ctx });
      rep = url
        ? `<img src="${escAttr(url)}" alt="${escAttr(alt)}" class="${escAttr(cls)}" loading="eager">`
        : `<div role="img" aria-label="${escAttr(alt)}" class="${escAttr(cls.replace(/\bobject-\S+/g, ''))} grid place-items-center overflow-hidden bg-soft">
             ${brandSvg ? `<div class="w-1/3 max-w-[180px] opacity-90 [&>svg]:h-auto [&>svg]:w-full">${brandSvg}</div>` : `<span class="font-head text-5xl font-bold text-primary opacity-60">${escAttr(monogram)}</span>`}</div>`;
    } else if (src && !/^data:image\//i.test(src)) {
      rep = ''; // ảnh từ URL lạ do LLM tự bịa → bỏ
    } else continue;
    out = out.replace(tag, rep);
  }
  return { html: out, credits: [...credits] };
}

/** Dựng trang hoàn chỉnh từ HTML của LLM */
export async function buildLlmPage(pool, { raw, plan, view, lead, brandSvg, ctx = {} }) {
  const name = lead.name.split(/[|–—]/)[0].trim();
  const monogram = (plan.brand.logo_text || name).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const cleaned = cleanHtml(raw);
  if (cleaned.replace(/<[^>]+>/g, '').trim().length < 80) throw new Error('HTML rỗng hoặc quá ngắn');
  if (!/data-section\s*=|<section\b|<header\b/i.test(cleaned)) throw new Error('Không có cấu trúc HTML (cần thẻ header/section có data-section)');
  if (view.kind === 'page') {
    const blocks = (cleaned.match(/data-section\s*=/gi) || []).length;
    const missing = [!/<header\b|<nav\b|data-section\s*=\s*["']header/i.test(cleaned) && 'header', !/<footer\b/i.test(cleaned) && 'footer', blocks < 4 && `chỉ có ${blocks} khối`].filter(Boolean);
    if (missing.length) throw new Error(`Trang chưa đầy đủ: thiếu ${missing.join(', ')}`);
  }
  const { html, credits } = await resolveHtmlImages(pool, cleaned, { brandSvg, monogram, ctx });
  const credit = credits.length ? `<div class="py-3 text-center text-xs text-muted">Ảnh: ${credits.join(', ')}</div>` : '';
  return shell({ plan, title: `${view.title} – ${name}`, body: html + (view.kind === 'page' ? credit : '') });
}
