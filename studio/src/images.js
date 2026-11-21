// Ảnh thật cho demo, thử lần lượt: Pixabay → Unsplash → Pexels → Openverse (không cần key, chỉ CC0/public domain)
// Hết nguồn → hình minh hoạ vector Iconify. Có cache trong DB.
// Ảnh Pixabay/Openverse được TẢI VỀ và nhúng vào trang (data URI): đúng điều khoản không hotlink, chụp ổn định hơn.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chat, parseJson, JUDGE_MODEL } from './llm.js';

const KEYS = {
  pixabay: process.env.PIXABAY_API_KEY || '',
  unsplash: process.env.UNSPLASH_ACCESS_KEY || '',
  pexels: process.env.PEXELS_API_KEY || '',
};
const OPENVERSE = process.env.OPENVERSE_ENABLED !== 'false';
const MEDIA_DIR = path.join(process.env.DATA_DIR || '/data', 'media');
const ILLU_SETS = ['fluent-emoji-flat', 'streamline-color', 'noto', 'fluent-color', 'flat-color-icons'];
const UA = { 'User-Agent': 'lead-studio/1.0 (local demo generator)' };

export const photosEnabled = () => Boolean(KEYS.pixabay || KEYS.unsplash || KEYS.pexels || OPENVERSE);
export const photoSources = () => [KEYS.pixabay && 'Pixabay', KEYS.unsplash && 'Unsplash', KEYS.pexels && 'Pexels', OPENVERSE && 'Openverse'].filter(Boolean);

async function cacheGet(pool, provider, query, maxAgeHours = null) {
  const r = await pool.query(
    `SELECT data FROM image_cache WHERE provider = $1 AND query = $2 AND ($3::int IS NULL OR created_at > now() - make_interval(hours => $3::int))`,
    [provider, query, maxAgeHours]);
  return r.rows[0]?.data ?? null;
}
async function cachePut(pool, provider, query, data) {
  await pool.query(
    `INSERT INTO image_cache (provider, query, data) VALUES ($1, $2, $3)
     ON CONFLICT (provider, query) DO UPDATE SET data = EXCLUDED.data, created_at = now()`,
    [provider, query, JSON.stringify(data)]);
}
const get = async (url, headers = {}, ms = 15000) => {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

// ---------- các nguồn ảnh: trả về [{url, credit, provider, download}] ----------
const SOURCES = {
  async pixabay(q) {
    const d = await get(`https://pixabay.com/api/?key=${KEYS.pixabay}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=12&min_width=1200`);
    return (d.hits || []).map((h) => ({ url: h.largeImageURL || h.webformatURL, thumb: h.previewURL || h.webformatURL, credit: h.user, provider: 'Pixabay', download: true }));
  },
  async unsplash(q) {
    const d = await get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape&content_filter=high`,
      { Authorization: `Client-ID ${KEYS.unsplash}`, 'Accept-Version': 'v1' });
    return (d.results || []).map((p) => ({ url: `${p.urls?.raw}&w=1600&q=80&fit=crop`, thumb: p.urls?.thumb, credit: p.user?.name, provider: 'Unsplash', download: false }));
  },
  async pexels(q) {
    const d = await get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape`, { Authorization: KEYS.pexels });
    return (d.photos || []).map((p) => ({ url: p.src?.large2x || p.src?.large, thumb: p.src?.tiny || p.src?.small, credit: p.photographer, provider: 'Pexels', download: false }));
  },
  async openverse(q) {
    // chỉ CC0 / public domain → không bắt buộc ghi nguồn; API hay quá tải nên thử lại 1 lần
    for (let i = 0; i < 2; i++) {
      try {
        const d = await get(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&aspect_ratio=wide&size=large&page_size=12&mature=false`, {}, 25000);
        return (d.results || []).filter((r) => (r.width || 0) >= 1000).map((r) => ({ url: r.url, thumb: r.thumbnail, credit: r.creator, provider: 'Openverse', download: true }));
      } catch (e) { if (i) throw e; await new Promise((r) => setTimeout(r, 2000)); }
    }
    return [];
  },
};
const ORDER = [['pixabay', () => KEYS.pixabay], ['unsplash', () => KEYS.unsplash], ['pexels', () => KEYS.pexels], ['openverse', () => OPENVERSE]];

/** Danh sách ảnh cho 1 từ khoá (cache) — nguồn đầu tiên có kết quả */
async function photosFor(pool, query) {
  const q = query.toLowerCase().trim();
  // link tải của Pixabay hết hạn sau 24h → danh sách ảnh chỉ cache 20h
  const cached = await cacheGet(pool, 'photo', q, 20);
  if (cached?.length) return cached;
  let list = [];
  for (const [name, enabled] of ORDER) {
    if (!enabled() || list.length) continue;
    try { list = await SOURCES[name](q); } catch { /* chuyển nguồn kế tiếp */ }
  }
  if (list.length) await cachePut(pool, 'photo', q, list);
  return list;
}

/** Tải ảnh về (cache theo URL) → data URI để nhúng thẳng vào trang */
async function toDataUri(url) {
  const file = path.join(MEDIA_DIR, `${crypto.createHash('sha1').update(url).digest('hex')}.img`);
  let buf;
  try { buf = await fs.readFile(file); } catch {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`tải ảnh HTTP ${r.status}`);
    buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) throw new Error('ảnh quá lớn');
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    await fs.writeFile(file, buf);
  }
  const type = buf[0] === 0x89 ? 'image/png' : buf[0] === 0x52 ? 'image/webp' : 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
}

/** Ảnh thật lấy từ website cũ của khách → data URI (bỏ ảnh quá nhỏ: icon, ảnh lỗi). null nếu không dùng được. */
export async function sitePhoto(url) {
  try {
    const d = await toDataUri(url);
    return d.length > 12000 ? d : null; // ~9KB ảnh gốc
  } catch { return null; }
}

/** SVG minh hoạ màu từ Iconify cho 1 từ khoá tiếng Anh */
export async function illustration(pool, keyword) {
  const k = String(keyword || '').toLowerCase().trim();
  if (!k) return null;
  const cached = await cacheGet(pool, 'iconify', k);
  if (cached) return cached.svg || null;
  let svg = null;
  try {
    const names = (await get(`https://api.iconify.design/search?query=${encodeURIComponent(k)}&limit=40&prefixes=${ILLU_SETS.join(',')}`, {}, 12000)).icons || [];
    const word = k.split(' ')[0];
    // ưu tiên tên khớp đúng (tránh "tooth" → "bluetooth"), rồi theo thứ tự bộ icon ưa thích
    const score = (n) => { const [set, name] = n.split(':'); return (name === k.replace(/ /g, '-') ? 0 : name === word ? 1 : name.startsWith(word) ? 2 : 5) * 10 + ILLU_SETS.indexOf(set); };
    const best = names.filter((n) => n.split(':')[1].includes(word)).sort((a, b) => score(a) - score(b))[0];
    if (best) {
      const [set, name] = best.split(':');
      const s = await fetch(`https://api.iconify.design/${set}/${name}.svg`, { headers: UA, signal: AbortSignal.timeout(12000) });
      if (s.ok) svg = (await s.text()).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
    }
  } catch { /* không có minh hoạ cũng được */ }
  await cachePut(pool, 'iconify', k, { svg });
  return svg;
}

/**
 * Gán ảnh cho mọi vị trí {image:{query}} trong các section của 1 trang.
 * `seed` để 2 shop cùng từ khoá không bị trùng y hệt ảnh. Trả về danh sách nguồn ảnh để ghi credit.
 */
/** Tải ảnh nhỏ → data URI (để gửi cho model đọc ảnh) */
async function smallDataUri(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 400 * 1024) throw new Error('ảnh thu nhỏ quá lớn');
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

/**
 * MiMo (đọc ảnh) xếp hạng tối đa 4 ảnh ứng viên cho 1 vị trí; ảnh dưới ngưỡng bị loại.
 * Cache theo (ngành + từ khoá) → lead sau cùng ngành không tốn token nữa.
 */
async function verifyCandidates(pool, query, cands, ctx) {
  const key = `${ctx.industry || ''}|${query}`.toLowerCase();
  // kết quả duyệt lưu theo link thumbnail (cố định) → ghép lại với danh sách ảnh mới nhất, không tốn token duyệt lại
  const idOf = (c) => c.thumb || c.url;
  const cached = await cacheGet(pool, 'vision', key);
  if (cached) {
    const byId = new Map(cands.map((c) => [idOf(c), c]));
    return cached.approved.map((a) => byId.get(a.id) && { ...byId.get(a.id), fit: a.fit }).filter(Boolean);
  }
  const minFit = ctx.minFit ?? 60;
  const imgs = [];
  for (const c of cands.slice(0, 4)) {
    try { imgs.push({ c, uri: await smallDataUri(c.thumb || c.url) }); } catch { /* bỏ ảnh tải lỗi */ }
  }
  if (!imgs.length) return [];
  const content = [];
  imgs.forEach((x, i) => { content.push({ type: 'text', text: `Ảnh ${i}:` }, { type: 'image_url', image_url: { url: x.uri } }); });
  content.push({ type: 'text', text: `Đây là ảnh ứng viên cho website của doanh nghiệp "${ctx.industry || '?'}" tại Việt Nam (đoán nghiệp vụ từ tên).
Vị trí ảnh cần: "${query}". Chấm từng ảnh 0–100: có ĐÚNG chủ đề/ngành không (sai ngành, sai bối cảnh = điểm thấp), có chuyên nghiệp, dùng được trên website không.
Trả JSON: {"scores":[{"i":0,"fit":0}]}` });
  let approved = [];
  try {
    const r = await chat({ model: JUDGE_MODEL, messages: [{ role: 'user', content }], maxTokens: 120, temperature: 0, json: true, timeoutMs: 60000 });
    ctx.onTokens?.(r);
    const scores = parseJson(r.content).scores || [];
    approved = scores.filter((x) => Number(x.fit) >= minFit && imgs[x.i])
      .sort((a, b) => b.fit - a.fit).map((x) => ({ ...imgs[x.i].c, fit: Number(x.fit) }));
  } catch { approved = []; } // duyệt lỗi → không dùng ảnh stock (thà không có còn hơn sai)
  await cachePut(pool, 'vision', key, { approved: approved.map((a) => ({ id: idOf(a), fit: a.fit })) });
  return approved;
}

/** Chọn 1 ảnh stock cho 1 từ khoá; `used` tránh trùng trong cùng màn hình; ghi nguồn vào `credits` */
export async function pickPhoto(pool, query, { used = new Set(), credits = new Set(), ctx = {} } = {}) {
  if (!query || !photosEnabled()) return null;
  const list = await photosFor(pool, query);
  // theo đúng thứ hạng của kho ảnh (không chọn ngẫu nhiên); có duyệt thì chỉ lấy ảnh đã đạt
  const pool_ = ctx.check ? await verifyCandidates(pool, query, list, ctx) : list.slice(0, 4);
  for (const p of pool_) {
    const id = p.thumb || p.url; // cùng 1 ảnh nhưng mỗi lần tìm Pixabay trả link tải khác → chống trùng theo thumbnail
    if (used.has(id)) continue;
    try {
      const url = p.download ? await toDataUri(p.url) : p.url;
      used.add(id);
      if (p.provider !== 'Openverse') credits.add(p.provider);
      return url;
    } catch { /* ảnh lỗi → thử ảnh khác */ }
  }
  return null;
}

// ---------- Ảnh thật của chính shop ----------
/** Ảnh Google Maps lấy cỡ lớn (đổi tham số kích thước của googleusercontent) */
const bigMapsPhoto = (u) => (/googleusercontent\.com/.test(u) ? u.replace(/=w\d+-h\d+[^?#]*$|=s\d+[^?#]*$/, '') + '=w1600-h1200-k-no' : u);

function parseCsv(t) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Tìm nhanh trên gosom theo tên + khu vực để lấy ảnh đại diện (khoảng 1 phút) */
async function lookupMapsPhoto(name, area, placeId) {
  const base = process.env.GMAPS_URL || 'http://gmaps:8080';
  const job = await (await fetch(`${base}/api/v1/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'studio-photo', keywords: [`${name} ${area || ''}`.trim()], lang: 'vi', zoom: 15, depth: 1, email: false, max_time: 240 }),
    signal: AbortSignal.timeout(15000) })).json();
  try {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const st = (await (await fetch(`${base}/api/v1/jobs/${job.id}`, { signal: AbortSignal.timeout(10000) })).json()).Status;
      if (st === 'failed') return null;
      if (st === 'ok') {
        const rows = parseCsv(await (await fetch(`${base}/api/v1/jobs/${job.id}/download`, { signal: AbortSignal.timeout(30000) })).text());
        const hit = rows.find((r) => placeId && r.place_id === placeId) || rows.find((r) => r.title && name.toLowerCase().includes(r.title.toLowerCase().slice(0, 12)));
        return hit?.thumbnail || null;
      }
    }
    return null;
  } finally {
    fetch(`${base}/api/v1/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * Ảnh thật của shop → data URI (hoặc null). Thứ tự: đã lưu → ảnh trong dữ liệu crawl / ảnh bìa fanpage → tìm nhanh trên gosom.
 * Lưu vào businesses.photo_url ('' = đã tìm mà không có, để không tìm lại).
 */
export async function shopPhoto(pool, businessId) {
  const b = (await pool.query(
    `SELECT b.name, b.search_area, b.place_id, b.photo_url, b.raw->>'thumbnail' AS thumb, b.raw->>'imageUrl' AS img,
            (SELECT f.raw->>'coverPhotoUrl' FROM facebook_pages f WHERE f.business_id = b.id) AS cover
     FROM businesses b WHERE b.id = $1`, [businessId])).rows[0];
  if (!b) return null;
  let url = b.photo_url;
  if (url == null) {
    url = b.thumb || b.img || b.cover || null;
    if (!url && !String(b.place_id).startsWith('fb:')) { try { url = await lookupMapsPhoto(b.name, b.search_area, b.place_id); } catch { url = null; } }
    await pool.query('UPDATE businesses SET photo_url = $2 WHERE id = $1', [businessId, url || '']);
  }
  if (!url) return null;
  try { return await toDataUri(bigMapsPhoto(url)); } catch { return null; }
}
