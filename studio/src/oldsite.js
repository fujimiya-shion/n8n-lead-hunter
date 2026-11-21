// Website cũ còn sống → fetch HTML (không để LLM tự duyệt web) → làm gọn bằng code → 1 lần LLM phân tích
// → bản phân tích ngắn (nội dung thật + bố cục + điểm yếu) dùng cho các bước tạo demo. Cache trong bảng site_snapshots.
import { chromium } from 'playwright';

const UA = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.5',
};
const SOCIAL = /(^|\.)(facebook|fb|instagram|tiktok|zalo|youtube|linkedin|shopee|lazada|google)\.[a-z.]+$/i;
const HOME_CHARS = 14000, SUB_CHARS = 4000, MAX_SUB = 3, CACHE_DAYS = 30;

/** Lead có website riêng còn sống (không phải trang mạng xã hội) → URL, ngược lại null */
export function oldSiteUrl(lead) {
  if (!lead.website_url || lead.web_reachable === false) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(lead.website_url) ? lead.website_url : `http://${lead.website_url}`);
    return SOCIAL.test(u.hostname) ? null : u.href;
  } catch { return null; }
}

function decode(buf, contentType) {
  let cs = /charset=([\w-]+)/i.exec(contentType || '')?.[1];
  if (!cs) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

const visibleText = (html) => html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Ưu tiên fetch thường (rẻ, nhanh). Chỉ dùng Chromium khi fetch lỗi (SSL hỏng…) hoặc trang render bằng JS (gần như không có chữ). */
async function getHtml(url) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (r.ok && /html/i.test(r.headers.get('content-type') || 'text/html')) {
      const buf = Buffer.from(await r.arrayBuffer());
      const html = decode(buf.subarray(0, 3 * 1024 * 1024), r.headers.get('content-type'));
      if (visibleText(html).length >= 300) return { url: r.url || url, html, via: 'fetch' };
    }
  } catch { /* thử Chromium */ }
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ ignoreHTTPSErrors: true, userAgent: UA['User-Agent'], locale: 'vi-VN' });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    return { url: page.url(), html: await page.content(), via: 'chromium' };
  } finally { await b.close(); }
}

const abs = (href, base) => { try { return new URL(href.replace(/&amp;/g, '&'), base).href; } catch { return null; } };
const attrOf = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(2).find((x) => x != null) ?? null;

/** Màu thương hiệu: đếm mã màu trong CSS nội tuyến, bỏ màu xám/đen/trắng */
function brandColors(html) {
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
    + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join('\n');
  const theme = attrOf(/<meta[^>]+name=["']theme-color["'][^>]*>/i.exec(html)?.[0] || '', 'content');
  const count = new Map();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue; // xám
    count.set(`#${h}`, (count.get(`#${h}`) || 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  return theme && /^#[0-9a-f]{3,6}$/i.test(theme) ? [theme.toLowerCase(), ...top.filter((c) => c !== theme.toLowerCase())].slice(0, 5) : top;
}

/**
 * Làm gọn HTML để LLM đọc rẻ: bỏ script/style/svg/head, bỏ gần hết thuộc tính (giữ class ngắn để đoán bố cục, href, alt),
 * bỏ thẻ định dạng chữ, ảnh thành [ảnh #n: alt], bỏ khối rỗng, gộp khoảng trắng.
 */
export function compactHtml(html, baseUrl) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const description = attrOf(/<meta[^>]+name=["']description["'][^>]*>/i.exec(html)?.[0] || '', 'content') || '';
  const colors = brandColors(html);
  const host = (() => { try { return new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  let body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] || html;
  body = body.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|canvas|video|audio|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(form|div|li)\b[^>]*(search|screen-reader|sr-only|cart|login)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<iframe\b[^>]*>([\s\S]*?<\/iframe>)?/gi, (m) => (/google\.[^"']*\/maps|maps\.google/i.test(m) ? ' [bản đồ Google Maps] ' : ' '));

  // ảnh (kể cả lazy-load và ảnh nền trong style)
  const images = [];
  const addImg = (src, alt) => {
    const u = src && abs(src, baseUrl);
    if (!u || /^data:|\.svg(\?|$)|\.gif(\?|$)|pixel|spacer|blank\./i.test(u)) return null;
    let i = images.findIndex((x) => x.src === u);
    if (i < 0) { if (images.length >= 30) return null; images.push({ src: u, alt: (alt || '').slice(0, 80) }); i = images.length - 1; }
    return i + 1;
  };
  body = body.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = attrOf(tag, 'data-src') || attrOf(tag, 'data-lazy-src') || attrOf(tag, 'data-original') || attrOf(tag, 'src');
    const alt = attrOf(tag, 'alt') || '';
    const n = addImg(src, alt);
    return n ? ` [ảnh #${n}${alt ? `: ${alt.slice(0, 60)}` : ''}] ` : ' ';
  });
  for (const m of body.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)/gi)) addImg(m[1], 'ảnh nền');

  // menu: link nội bộ trong header/nav
  const links = [];
  const navHtml = [...body.matchAll(/<(nav|header)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]).join(' ');
  for (const m of navHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = abs(attrOf(m[1], 'href') || '', baseUrl);
    const text = visibleText(m[2]).slice(0, 50);
    if (!href || !text || text.length < 2 || text.startsWith('[ảnh') || /^(tel|mailto|javascript):/i.test(href)) continue;
    let h; try { h = new URL(href); } catch { continue; }
    if (h.hostname.replace(/^www\./, '') !== host || links.some((l) => l.href === href.split('#')[0])) continue;
    links.push({ text, href: href.split('#')[0] });
    if (links.length >= 20) break;
  }

  // Chỉ giữ: thẻ khung trang, tiêu đề, đoạn, danh sách, bảng, form. Div chỉ giữ khi class/id gợi ý vai trò bố cục
  // (banner, dịch vụ, liên hệ…); div/span trơn bị bỏ (chỉ để lại chữ). Thuộc tính chỉ giữ 1 nhãn vai trò.
  const KEEP = /^(header|nav|main|section|article|aside|footer|div|h[1-6]|p|ul|ol|li|form|input|textarea|button|table|tr|td|th|blockquote|address)$/i;
  const ROLE = /banner|slide|carousel|hero|service|product|project|portfolio|about|intro|team|doctor|staff|news|post|blog|contact|testimon|review|feedback|gallery|album|price|pricing|faq|partner|client|brand|feature|why|video|map|cta|counter|stat|footer|header|menu|course|room|step|process|certif|award|col-(?:md|lg)-\d+|grid/i;
  const stack = [];
  body = body.replace(/<\/?([a-z0-9-]+)\b([^>]*)>/gi, (tag, name, attrs) => {
    name = name.toLowerCase();
    if (!KEEP.test(name)) return /^(br|hr)$/i.test(name) ? ' ' : ' ';
    if (name === 'div') {
      if (tag[1] === '/') return stack.pop() ? '</div>' : ' ';
      const label = `${attrOf(attrs, 'id') || ''} ${attrOf(attrs, 'class') || ''}`;
      const m = ROLE.exec(label);
      stack.push(Boolean(m));
      return m ? `<div role="${m[0].toLowerCase()}">` : ' ';
    }
    if (tag[1] === '/') return `</${name}>`;
    const keep = [];
    if (/^(section|header|footer|article|aside)$/.test(name)) {
      const m = ROLE.exec(`${attrOf(attrs, 'id') || ''} ${attrOf(attrs, 'class') || ''}`);
      if (m) keep.push(`role="${m[0].toLowerCase()}"`);
    }
    if (/^(input|textarea)$/i.test(name)) { const p = attrOf(attrs, 'placeholder') || attrOf(attrs, 'name'); if (p) keep.push(`placeholder="${p.slice(0, 40)}"`); }
    return `<${name}${keep.length ? ` ${keep.join(' ')}` : ''}>`;
  });
  body = body.replace(/&nbsp;/g, ' ').replace(/[ \t\r\n]+/g, ' ');
  // bỏ khối rỗng lặp lại nhiều lần (div lồng div)
  for (let i = 0; i < 8; i++) {
    const next = body.replace(/<(div|section|p|li|ul|ol|article|aside|main|header|footer|nav|td|tr|table|h[1-6]|button|form)\b[^>]*>\s*<\/\1>/gi, '')
      .replace(/(<div role="([a-z-]+)">)\s*<div role="\2">([^<]*(?:<(?!\/?div)[^<]*)*)<\/div>\s*<\/div>/gi, '$1$3</div>');
    if (next === body) break;
    body = next;
  }
  return { title, description, colors, images, links, html: body.replace(/>\s+</g, '><').trim() };
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…[cắt bớt]` : s);

/** Messages cho bước LLM phân tích website cũ (1 lời gọi duy nhất cho cả trang chủ + vài trang con) */
export function oldSiteMessages(lead, home, subs) {
  const system = 'Bạn là UI/UX designer phân tích website cũ của khách để làm lại giao diện mới. Chỉ trả lời bằng 1 object JSON.';
  const user = `Doanh nghiệp: ${lead.name} · khu vực ${lead.area}${lead.phone ? ` · SĐT ${lead.phone}` : ''}
Website: ${home.url}
Tiêu đề trang: ${home.title}${home.description ? `\nMô tả: ${home.description}` : ''}
Màu xuất hiện nhiều trong CSS: ${home.colors.join(', ') || 'không rõ'}
Menu: ${home.links.map((l) => l.text).join(' · ') || 'không rõ'}
Danh sách ảnh trên trang chủ: ${home.images.map((im, i) => `#${i + 1} ${im.src.split('/').pop().slice(0, 60)}${im.alt ? ` (${im.alt})` : ''}`).join(' | ') || 'không có'}

HTML TRANG CHỦ (đã làm gọn: bỏ script/style, ảnh thành [ảnh #n]):
${clip(home.html, HOME_CHARS)}
${subs.map((s) => `\nHTML TRANG CON "${s.text}" (${s.url}):\n${clip(s.html, SUB_CHARS)}`).join('\n')}

Phân tích và trả về JSON:
{
  "business": "1–2 câu: doanh nghiệp thật sự làm gì (theo nội dung web)",
  "home_layout": [ { "block": "tên khối theo thứ tự trên trang chủ cũ + cách trình bày (vd: banner slider 3 ảnh, dịch vụ lưới 3 cột, tin tức...)", "content": "nội dung THẬT chính của khối: giữ nguyên tên dịch vụ/sản phẩm, con số, giá, cam kết" } ],
  "pages": [ { "title": "tên trang con có trong menu", "content": "nội dung thật chính (ngắn gọn)" } ],
  "facts": { "hours": "giờ làm việc nếu web ghi, không có thì \\"\\"", "address": "", "phones": [], "emails": [], "since": "năm thành lập/kinh nghiệm nếu web ghi", "services": ["..."], "prices": ["mục: giá (nếu web có)"], "highlights": ["điểm mạnh/cam kết web ghi"] },
  "brand": { "primary": "#hex màu thương hiệu (logo/nút chính) nếu đoán được, không thì \\"\\"", "logo_text": "tên trên logo" },
  "weaknesses": ["2–4 điểm yếu CỤ THỂ về giao diện/trải nghiệm của web cũ (vd: banner chữ đè ảnh khó đọc, không có nút gọi nổi, menu quá nhiều mục…)"],
  "photos": [số thứ tự các ảnh là ẢNH CHỤP THẬT của doanh nghiệp/sản phẩm/công trình dùng lại được (KHÔNG chọn logo, icon, banner có chữ, ảnh đối tác), tối đa 6]
}
Chỉ dùng thông tin có trong HTML, KHÔNG bịa.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Đoạn văn mô tả website cũ để chèn vào các prompt sau (ngắn, không chứa HTML) */
export function oldSiteBrief(a, { withPhotos = false } = {}) {
  if (!a) return '';
  const f = a.facts || {};
  const line = (k, v) => (v && (!Array.isArray(v) || v.length) ? `- ${k}: ${Array.isArray(v) ? v.join('; ') : v}` : null);
  return [
    `Website: ${a.url}`,
    a.business ? `Doanh nghiệp (theo web): ${a.business}` : null,
    a.home_layout?.length ? `Trang chủ cũ (theo thứ tự):\n${a.home_layout.map((b, i) => `  ${i + 1}. ${b.block} — ${b.content}`).join('\n')}` : null,
    a.pages?.length ? `Các trang khác trên web cũ:\n${a.pages.map((p) => `  · ${p.title}: ${p.content}`).join('\n')}` : null,
    'Thông tin thật trên web cũ (được dùng nguyên văn):',
    line('Giờ làm việc', f.hours), line('Địa chỉ', f.address), line('SĐT', f.phones), line('Email', f.emails),
    line('Thành lập/kinh nghiệm', f.since), line('Dịch vụ/sản phẩm', f.services), line('Giá', f.prices), line('Điểm mạnh', f.highlights),
    a.brand?.primary ? `Màu thương hiệu web cũ: ${a.brand.primary}` : null,
    a.weaknesses?.length ? `Điểm yếu giao diện web cũ cần khắc phục: ${a.weaknesses.join('; ')}` : null,
    withPhotos && a.photo_urls?.length ? `Ảnh thật lấy từ web cũ: ${a.photo_urls.length} ảnh — chèn bằng <img data-site-photo="1"> … <img data-site-photo="${a.photo_urls.length}"> (kèm alt, class).` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Phân tích website cũ của lead (cache CACHE_DAYS ngày). Trả về { analysis, prompt, tokensIn, tokensOut } hoặc null nếu web không dùng được.
 * askJson(messages, maxTokens) do generate.js truyền vào (để cộng token vào bản demo).
 */
export async function analyzeOldSite(pool, lead, askJson) {
  const url = oldSiteUrl(lead);
  if (!url) return null;
  const cached = (await pool.query(
    `SELECT analysis FROM site_snapshots WHERE business_id = $1 AND url = $2 AND analysis IS NOT NULL
       AND fetched_at > now() - make_interval(days => $3) ORDER BY fetched_at DESC LIMIT 1`, [lead.id, url, CACHE_DAYS])).rows[0];
  if (cached) return { analysis: cached.analysis, prompt: null, cached: true };

  const page = await getHtml(url);
  const home = { url: page.url, ...compactHtml(page.html, page.url) };
  if (visibleText(home.html).length < 200) throw new Error('Website cũ gần như không có nội dung đọc được');
  const subs = [];
  for (const l of home.links) {
    if (subs.length >= MAX_SUB) break;
    if (new URL(l.href).pathname.replace(/\/$/, '') === new URL(home.url).pathname.replace(/\/$/, '')) continue;
    try {
      const r = await fetch(l.href, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) continue;
      const c = compactHtml(decode(Buffer.from(await r.arrayBuffer()), r.headers.get('content-type')), r.url);
      if (visibleText(c.html).length > 200) subs.push({ text: l.text, url: r.url, html: c.html });
    } catch { /* bỏ trang con lỗi */ }
  }
  const prompt = oldSiteMessages(lead, home, subs);
  const raw = await askJson(prompt, 3500);
  const photos = (Array.isArray(raw.photos) ? raw.photos : []).map(Number).filter((n) => n >= 1 && n <= home.images.length).slice(0, 6);
  const analysis = {
    url: home.url, via: page.via, title: home.title, colors: home.colors,
    business: String(raw.business || '').slice(0, 400),
    home_layout: (Array.isArray(raw.home_layout) ? raw.home_layout : []).slice(0, 14).map((b) => ({ block: String(b.block || '').slice(0, 160), content: String(b.content || '').slice(0, 500) })),
    pages: (Array.isArray(raw.pages) ? raw.pages : []).slice(0, 8).map((p) => ({ title: String(p.title || '').slice(0, 60), content: String(p.content || '').slice(0, 400) })),
    facts: raw.facts && typeof raw.facts === 'object' ? raw.facts : {},
    brand: raw.brand && typeof raw.brand === 'object' ? raw.brand : {},
    weaknesses: (Array.isArray(raw.weaknesses) ? raw.weaknesses : []).slice(0, 5).map((x) => String(x).slice(0, 200)),
    photo_urls: photos.map((n) => home.images[n - 1].src),
    nav: home.links.map((l) => l.text),
  };
  await pool.query(
    `INSERT INTO site_snapshots (business_id, url, via, compact_chars, analysis) VALUES ($1, $2, $3, $4, $5)`,
    [lead.id, url, page.via, home.html.length + subs.reduce((s, x) => s + x.html.length, 0), JSON.stringify(analysis)]);
  return { analysis, prompt, cached: false };
}

/** Ảnh thật từ web cũ của 1 lead (đã phân tích trước đó) */
export async function sitePhotoUrls(pool, businessId) {
  const r = (await pool.query(
    `SELECT analysis->'photo_urls' AS p FROM site_snapshots WHERE business_id = $1 AND analysis IS NOT NULL ORDER BY fetched_at DESC LIMIT 1`, [businessId])).rows[0];
  return Array.isArray(r?.p) ? r.p : [];
}
