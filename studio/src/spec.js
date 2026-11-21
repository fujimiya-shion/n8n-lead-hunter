// Chuẩn hoá kết quả bước lên kế hoạch (1 lời gọi LLM): tin nhắn + thương hiệu + danh sách màn hình.
// Mọi trường đều được kiểm tra kiểu / giới hạn độ dài; giá trị lạ → giá trị mặc định an toàn.
import { DIRECTIONS, DIRECTION_KEYS } from './directions.js';
import { normalizeColors, pickFont, pickBodyFont } from './brand.js';
import { VISUAL_STYLES } from './visualstyles.js';

const str = (v, max, def = '') => {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '';
  return (s || def).slice(0, max);
};
const list = (v, max) => (Array.isArray(v) ? v : []).filter((x) => x != null && x !== '').slice(0, max);
const slugify = (s, i) => (str(s, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `man-hinh-${i + 1}`);
const kw = (v) => str(v, 40).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim();

/** Màn hình đầu luôn là trang chủ (page); các màn hình sau là section hoặc modal */
export function normalizeScreens(raw, max = 4) {
  const seen = new Set();
  return list(raw, max).map((x, i) => {
    let slug = slugify(x.slug || x.title, i);
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    return {
      slug,
      title: str(x.title, 50, i === 0 ? 'Trang chủ' : `Màn hình ${i + 1}`),
      kind: i === 0 ? 'page' : (x.kind === 'modal' ? 'modal' : 'section'),
      brief: str(x.brief, 1000),
    };
  });
}

export function normalizePlan(raw, maxScreens = 4) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = r.brand && typeof r.brand === 'object' ? r.brand : {};
  return {
    message: String(r.message || '').trim().slice(0, 1500),
    brand: {
      // phong cách thị giác (màu/font/hình khối/hoạ tiết); LLM trả sai tên → không ép phong cách nào
      style: VISUAL_STYLES[b.style] ? b.style : '',
      // hướng nghệ thuật; LLM trả sai tên → chọn ngẫu nhiên (không mặc định 1 hướng)
      direction: DIRECTIONS[b.direction] ? b.direction : DIRECTION_KEYS[Math.floor(Math.random() * DIRECTION_KEYS.length)],
      logo_text: str(b.logo_text, 40),
      illustration: kw(b.illustration),
      colors: normalizeColors(b.colors || {}),
      font_heading: pickFont(b.font_heading, 'Be Vietnam Pro'),
      font_body: pickBodyFont(b.font_body, 'Be Vietnam Pro'),
    },
    screens: normalizeScreens(r.screens, maxScreens),
  };
}
