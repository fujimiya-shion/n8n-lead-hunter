// Ảnh thật cho demo, thử lần lượt: Pixabay → Unsplash → Pexels → Openverse (không cần key, chỉ CC0/public domain)
// Hết nguồn → hình minh hoạ vector Iconify. Có cache trong DB.
// Ảnh Pixabay/Openverse được TẢI VỀ và nhúng vào trang (data URI): đúng điều khoản không hotlink, chụp ổn định hơn.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

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

async function cacheGet(pool, provider, query) {
  const r = await pool.query('SELECT data FROM image_cache WHERE provider = $1 AND query = $2', [provider, query]);
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
    return (d.hits || []).map((h) => ({ url: h.largeImageURL || h.webformatURL, credit: h.user, provider: 'Pixabay', download: true }));
  },
  async unsplash(q) {
    const d = await get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape&content_filter=high`,
      { Authorization: `Client-ID ${KEYS.unsplash}`, 'Accept-Version': 'v1' });
    return (d.results || []).map((p) => ({ url: `${p.urls?.raw}&w=1600&q=80&fit=crop`, credit: p.user?.name, provider: 'Unsplash', download: false }));
  },
  async pexels(q) {
    const d = await get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=10&orientation=landscape`, { Authorization: KEYS.pexels });
    return (d.photos || []).map((p) => ({ url: p.src?.large2x || p.src?.large, credit: p.photographer, provider: 'Pexels', download: false }));
  },
  async openverse(q) {
    // chỉ CC0 / public domain → không bắt buộc ghi nguồn; API hay quá tải nên thử lại 1 lần
    for (let i = 0; i < 2; i++) {
      try {
        const d = await get(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&aspect_ratio=wide&size=large&page_size=12&mature=false`, {}, 25000);
        return (d.results || []).filter((r) => (r.width || 0) >= 1000).map((r) => ({ url: r.url, credit: r.creator, provider: 'Openverse', download: true }));
      } catch (e) { if (i) throw e; await new Promise((r) => setTimeout(r, 2000)); }
    }
    return [];
  },
};
const ORDER = [['pixabay', () => KEYS.pixabay], ['unsplash', () => KEYS.unsplash], ['pexels', () => KEYS.pexels], ['openverse', () => OPENVERSE]];

/** Danh sách ảnh cho 1 từ khoá (cache) — nguồn đầu tiên có kết quả */
async function photosFor(pool, query) {
  const q = query.toLowerCase().trim();
  const cached = await cacheGet(pool, 'photo', q);
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
/** Chọn 1 ảnh thật cho 1 từ khoá; `used` tránh trùng ảnh trong cùng màn hình; ghi nguồn vào `credits` */
export async function pickPhoto(pool, query, { seed = 0, salt = 0, used = new Set(), credits = new Set() } = {}) {
  if (!query || !photosEnabled()) return null;
  const list = await photosFor(pool, query);
  for (let k = 0; k < list.length; k++) {
    const p = list[(seed + salt + k) % list.length];
    if (used.has(p.url)) continue;
    try {
      const url = p.download ? await toDataUri(p.url) : p.url;
      used.add(p.url);
      if (p.provider !== 'Openverse') credits.add(p.provider);
      return url;
    } catch { /* ảnh lỗi → thử ảnh khác */ }
  }
  return null;
}

export async function resolvePageMedia(pool, sections, seed = 0) {
  const credits = new Set();
  const used = new Set();
  const pick = async (img, salt) => {
    if (!img) return null;
    const url = await pickPhoto(pool, img.query, { seed, salt, used, credits });
    return url ? { ...img, url } : null;
  };
  let salt = 0;
  for (const s of sections) {
    s.image = await pick(s.image, salt++);
    for (const it of s.items) it.image = await pick(it.image, salt++);
    s.illustrationSvg = s.illustration ? await illustration(pool, s.illustration) : null;
  }
  return [...credits];
}
