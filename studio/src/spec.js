import { DIRECTIONS, DIRECTION_KEYS } from './directions.js';
// Response spec: LLM trả JSON theo spec này → parseJson → normalize → JS object an toàn để dựng trang.
// Thư viện thành phần CHUNG cho mọi ngành; LLM tự chọn trang, section, variant, phong cách.
import { STYLES, DEFAULT_STYLE, normalizeColors, pickFont } from './styles.js';

// type → { variants, fields (mô tả cho LLM), items (mô tả 1 phần tử items[]) }
export const COMPONENTS = {
  navbar:       { variants: ['simple', 'centered', 'with-topbar'], fields: 'links: [3–5 chữ ngắn], cta: {label}', note: 'luôn là section đầu tiên' },
  hero:         { variants: ['split-image', 'centered', 'image-background', 'minimal-text', 'illustration'], fields: 'eyebrow, heading, subheading, cta: {label, secondary_label}, image: {query, alt}, illustration, items: [2–3 điểm nổi bật ngắn {title, icon}]' },
  trust_bar:    { variants: ['icons-row', 'text-row'], fields: 'items: [3–5 {title, icon}] (cam kết, chứng nhận, ưu điểm ngắn)' },
  stats:        { variants: ['row', 'cards'], fields: 'heading?, items: [3–4 {value, label}]' },
  services:     { variants: ['grid-cards', 'list-rows', 'image-cards'], fields: 'eyebrow?, heading, subheading, items: [3–8 {title, text, icon, price?, image?: {query, alt}}]' },
  feature_list: { variants: ['two-column', 'alternating', 'icon-grid'], fields: 'eyebrow?, heading, subheading?, body?, image?: {query, alt}, items: [3–6 {title, text, icon, image?: {query, alt}}]' },
  about:        { variants: ['image-left', 'image-right', 'text-only'], fields: 'eyebrow?, heading, body (2–4 câu), image: {query, alt}, items?: [2–4 {title, text}]' },
  team:         { variants: ['cards', 'compact'], fields: 'heading, subheading?, items: [3–6 {name, role, text, image?: {query, alt}}]' },
  gallery:      { variants: ['grid', 'masonry'], fields: 'heading, subheading?, items: [4–8 {title, meta?, image: {query, alt}}]' },
  process:      { variants: ['steps-horizontal', 'timeline-vertical'], fields: 'heading, subheading?, items: [3–6 {title, text}]' },
  pricing:      { variants: ['cards', 'table'], fields: 'heading, subheading?, note?, items: [2–4 {title, price, unit?, features: [3–6 chữ], featured?: bool, badge?}]' },
  price_list:   { variants: ['two-column', 'grouped'], fields: 'heading, subheading?, note?, items: [6–14 {title, price, text?, group?}]' },
  schedule:     { variants: ['table', 'cards'], fields: 'heading, subheading?, items: [3–8 {title, day, time, meta?, badge?}] (lịch khai giảng / lịch làm việc / lịch tour...)' },
  testimonials: { variants: ['cards', 'single-quote'], fields: 'heading, items: [2–3 {name, role, quote, rating 1–5}]' },
  faq:          { variants: ['accordion', 'two-column'], fields: 'heading, items: [3–6 {q, a}]' },
  booking_form: { variants: ['split', 'centered', 'steps'], fields: 'eyebrow?, heading, subheading, illustration?, fields: [4–7 {label, type: text|tel|date|time|select|textarea, placeholder?, options?: [..]}], cta: {label}, items?: [2–4 {title, text, icon}] (thông tin bên cạnh form), note?' },
  contact:      { variants: ['split-map', 'cards'], fields: 'heading, subheading?, items: [3–4 {title, text, icon}] (giờ mở cửa, chỉ đường, đỗ xe...)' },
  cta:          { variants: ['banner', 'split', 'minimal'], fields: 'heading, subheading, cta: {label, secondary_label?}, image?: {query, alt}, illustration?' },
  footer:       { variants: ['simple', 'columns'], fields: 'body (1 câu giới thiệu), links?: [..]', note: 'luôn là section cuối cùng' },
};

export const STYLE_NAMES = Object.keys(STYLES);

/** Mô tả spec để chèn vào prompt */
export function componentDoc({ fields = true } = {}) {
  return Object.entries(COMPONENTS)
    .map(([t, c]) => `- ${t} (variant: ${c.variants.join(' | ')})${c.note ? ` — ${c.note}` : ''}${fields ? `\n    trường: ${c.fields}` : ''}`)
    .join('\n');
}
export function styleDoc() {
  return Object.entries(STYLES).map(([k, s]) => `- ${k}: ${s.desc}`).join('\n');
}

// ---------- helpers làm sạch ----------
const str = (v, max, def = '') => {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '';
  return (s || def).slice(0, max);
};
const list = (v, max) => (Array.isArray(v) ? v : []).filter((x) => x != null && x !== '').slice(0, max);
const slugify = (s, i) => (str(s, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `trang-${i + 1}`);
const icon = (v) => (/^[a-z0-9-]{2,40}$/.test(String(v || '')) ? String(v) : '');
const image = (v) => (v && typeof v === 'object' && str(v.query, 80)
  ? { query: str(v.query, 80).replace(/[^\p{L}\p{N} ,'-]/gu, ''), alt: str(v.alt, 120) } : null);
const kw = (v) => str(v, 40).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim();

/** Kế hoạch site */
export function normalizePlan(raw, maxPages = 4) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const b = r.brand || {};
  const colors = normalizeColors(b.colors || {});
  // 1 phong cách cho CẢ site (các trang phải đồng nhất). Bản cũ để ở từng trang → lấy trang đầu.
  const siteStyle = STYLES[b.style] ? b.style : STYLES[r.pages?.[0]?.style] ? r.pages[0].style : DEFAULT_STYLE;
  const pages = list(r.pages, maxPages).map((p, i) => {
    const sections = list(p.sections, 12)
      .map((s) => ({ type: str(s.type, 30), variant: str(s.variant, 30) }))
      .filter((s) => COMPONENTS[s.type])
      .map((s) => ({ ...s, variant: COMPONENTS[s.type].variants.includes(s.variant) ? s.variant : COMPONENTS[s.type].variants[0] }));
    // Màn hình đầu luôn là trang chủ đầy đủ (header → footer).
    // Các màn hình sau chỉ là section hoặc modal: KHÔNG header/hero/footer.
    const kind = i === 0 ? 'page' : (['section', 'modal'].includes(p.kind) ? p.kind : 'section');
    const body = sections.filter((s) => s.type !== 'navbar' && s.type !== 'footer');
    let picked;
    if (kind === 'page') {
      const nav = sections.find((s) => s.type === 'navbar') || { type: 'navbar', variant: 'simple' };
      const foot = sections.find((s) => s.type === 'footer') || { type: 'footer', variant: 'simple' };
      picked = [nav, ...body, foot];
    } else if (kind === 'modal') {
      picked = body.filter((s) => s.type !== 'hero').slice(0, 2);
    } else {
      picked = body.filter((s) => s.type !== 'hero').slice(0, 4);
    }
    return {
      slug: slugify(p.slug || p.title, i),
      title: str(p.title, 40, i === 0 ? 'Trang chủ' : `Màn hình ${i + 1}`),
      purpose: str(p.purpose, 200),
      layout: str(p.layout, 400),   // bản bố cục riêng của màn hình (để các màn hình không giống nhau)
      kind,
      style: siteStyle,
      sections: picked,
    };
  }).filter((p) => p.sections.length >= (p.kind === 'page' ? 3 : 1));
  return {
    message: String(r.message || '').trim().slice(0, 1500),
    brand: {
      style: siteStyle,
      // hướng nghệ thuật cho tab LLM; LLM trả sai tên → chọn ngẫu nhiên (không mặc định 1 hướng)
      direction: DIRECTIONS[b.direction] ? b.direction : DIRECTION_KEYS[Math.floor(Math.random() * DIRECTION_KEYS.length)],
      logo_text: str(b.logo_text, 40),
      illustration: kw(b.illustration),
      colors,
      font_heading: pickFont(b.font_heading, 'Be Vietnam Pro'),
      font_body: pickFont(b.font_body, 'Be Vietnam Pro'),
    },
    pages,
  };
}

/** Nội dung 1 trang: khớp với danh sách section trong kế hoạch, trường lạ bị bỏ */
export function normalizePage(raw, planPage) {
  const got = list(raw && raw.sections, 14);
  return planPage.sections.map((ps, i) => {
    // ưu tiên section cùng vị trí + cùng type; không có thì tìm theo type
    const s = (got[i] && got[i].type === ps.type ? got[i] : got.find((x) => x && x.type === ps.type)) || {};
    const it = (x) => (x && typeof x === 'object' ? x : { title: str(x, 120) });
    return {
      type: ps.type,
      variant: ps.variant,
      eyebrow: str(s.eyebrow, 60),
      heading: str(s.heading, 110),
      subheading: str(s.subheading, 260),
      body: str(s.body, 700),
      note: str(s.note, 200),
      image: image(s.image),
      illustration: kw(s.illustration),
      links: list(s.links, 6).map((x) => str(x, 24)).filter(Boolean),
      cta: s.cta && typeof s.cta === 'object' ? { label: str(s.cta.label, 30), secondary_label: str(s.cta.secondary_label, 30) } : { label: '', secondary_label: '' },
      fields: list(s.fields, 8).map((f) => ({
        label: str(f.label, 40), placeholder: str(f.placeholder, 60),
        type: ['text', 'tel', 'date', 'time', 'select', 'textarea'].includes(f.type) ? f.type : 'text',
        options: list(f.options, 10).map((o) => str(o, 50)).filter(Boolean),
      })).filter((f) => f.label),
      items: list(s.items, 14).map(it).map((x) => ({
        title: str(x.title || x.name, 80), text: str(x.text, 260), icon: icon(x.icon), image: image(x.image),
        price: str(x.price, 30), unit: str(x.unit, 24), meta: str(x.meta, 80), badge: str(x.badge, 30), group: str(x.group, 40),
        name: str(x.name, 40), role: str(x.role, 60), quote: str(x.quote, 320), rating: Math.max(0, Math.min(5, Math.round(Number(x.rating) || 5))),
        value: str(x.value, 16), label: str(x.label, 50), q: str(x.q, 140), a: str(x.a, 400), day: str(x.day, 40), time: str(x.time, 40),
        featured: Boolean(x.featured), features: list(x.features, 6).map((f) => str(f, 80)).filter(Boolean),
      })).filter((x) => x.title || x.name || x.q || x.value),
    };
  });
}

/** Danh sách màn hình do LLM tự quyết (tab "LLM tự thiết kế") */
export function normalizeScreens(raw, max = 4) {
  const seen = new Set();
  return list(raw && raw.screens, max).map((x, i) => {
    let slug = slugify(x.slug || x.title, i);
    while (seen.has(slug)) slug += '-2';
    seen.add(slug);
    return {
      slug,
      title: str(x.title, 50, `Màn hình ${i + 1}`),
      // màn hình đầu luôn là Trang chủ (page); các màn hình sau chỉ là section hoặc modal
      kind: i === 0 ? 'page' : (x.kind === 'modal' ? 'modal' : 'section'),
      brief: str(x.brief, 1000),
    };
  }).filter((x) => x.title);
}
