// Hệ phong cách thiết kế (KHÔNG gắn với ngành). LLM chọn phong cách cho từng trang.
// Mỗi phong cách = bộ quy tắc dàn trang: bo góc, bóng, viền, khoảng cách, chữ, cách dùng màu.

export const STYLES = {
  'minimal-business': {
    desc: 'Tối giản kiểu doanh nghiệp: nhiều khoảng trắng, chữ đậm rõ ràng, viền mảnh, KHÔNG gradient, KHÔNG đổ bóng, góc bo nhỏ, màu nhấn dùng tiết kiệm.',
    card: 'rounded-md border border-[color:var(--line)] bg-white', btn: 'rounded-md', img: 'rounded-md', pill: 'rounded-md',
    shadow: '', pad: 'py-20 md:py-28', h1: 'text-4xl md:text-6xl font-bold tracking-tight', h2: 'text-3xl md:text-4xl font-bold tracking-tight',
    eyebrow: 'text-xs font-semibold uppercase tracking-[.2em] text-p', alt: 'bg-[color:var(--soft)]', serif: false, darkHero: false,
  },
  editorial: {
    desc: 'Kiểu tạp chí: tiêu đề font serif lớn, ảnh to, đường kẻ phân cách mảnh, bố cục lệch, nền kem/trắng ngà, không bóng.',
    card: 'border-t border-[color:var(--ink)] pt-6', btn: 'rounded-none', img: 'rounded-none', pill: 'rounded-none',
    shadow: '', pad: 'py-20 md:py-28', h1: 'text-5xl md:text-7xl font-medium leading-[1.05]', h2: 'text-4xl md:text-5xl font-medium',
    eyebrow: 'text-xs uppercase tracking-[.3em] text-[color:var(--muted)]', alt: 'bg-[color:var(--cream)]', serif: true, darkHero: false,
  },
  'soft-friendly': {
    desc: 'Mềm mại, thân thiện: góc bo lớn, nền màu nhạt đặc (không gradient), hình minh hoạ vector, bóng rất nhẹ, chữ tròn trịa.',
    card: 'rounded-3xl bg-white ring-1 ring-[color:var(--line)]', btn: 'rounded-full', img: 'rounded-3xl', pill: 'rounded-full',
    shadow: 'shadow-[0_2px_10px_rgba(0,0,0,.04)]', pad: 'py-20 md:py-24', h1: 'text-4xl md:text-6xl font-extrabold tracking-tight', h2: 'text-3xl md:text-4xl font-extrabold',
    eyebrow: 'inline-block rounded-full bg-[color:var(--soft)] px-3 py-1 text-sm font-semibold text-p', alt: 'bg-[color:var(--soft)]', serif: false, darkHero: false,
  },
  'bold-modern': {
    desc: 'Hiện đại mạnh mẽ: khối màu đặc tương phản cao, chữ rất lớn, một số section nền tối, góc vuông hoặc bo vừa, không bóng.',
    card: 'rounded-lg bg-white border-2 border-[color:var(--ink)]', btn: 'rounded-lg', img: 'rounded-lg', pill: 'rounded-lg',
    shadow: '', pad: 'py-20 md:py-28', h1: 'text-5xl md:text-7xl font-black tracking-tight uppercase', h2: 'text-4xl md:text-5xl font-black tracking-tight',
    eyebrow: 'text-sm font-bold uppercase tracking-widest text-p', alt: 'bg-[color:var(--soft)]', serif: false, darkHero: true,
  },
  'clinical-clean': {
    desc: 'Sạch sẽ chuyên môn: nền trắng, một màu nhấn, icon đường nét, lưới chặt chẽ, thông tin rõ ràng, viền nhạt, không gradient.',
    card: 'rounded-xl border border-[color:var(--line)] bg-white', btn: 'rounded-lg', img: 'rounded-xl', pill: 'rounded-full',
    shadow: '', pad: 'py-16 md:py-24', h1: 'text-4xl md:text-5xl font-bold tracking-tight', h2: 'text-3xl md:text-4xl font-bold',
    eyebrow: 'text-sm font-semibold text-p', alt: 'bg-[color:var(--soft)]', serif: false, darkHero: false,
  },
  luxury: {
    desc: 'Sang trọng: nền tối hoặc kem, tiêu đề serif, chữ giãn cách, nhiều ảnh, màu nhấn ánh kim tiết chế, viền mảnh, không bóng.',
    card: 'border border-[color:var(--line)]', btn: 'rounded-none', img: 'rounded-none', pill: 'rounded-none',
    shadow: '', pad: 'py-24 md:py-32', h1: 'text-5xl md:text-7xl font-normal tracking-wide', h2: 'text-4xl md:text-5xl font-normal tracking-wide',
    eyebrow: 'text-xs uppercase tracking-[.35em] text-p', alt: 'bg-[color:var(--cream)]', serif: true, darkHero: true,
  },
};
export const DEFAULT_STYLE = 'minimal-business';

// Google Fonts có hỗ trợ tiếng Việt
export const FONTS = {
  sans: ['Be Vietnam Pro', 'Inter', 'Montserrat', 'Nunito', 'Quicksand', 'Lexend', 'Roboto', 'Open Sans'],
  serif: ['Playfair Display', 'Lora', 'Merriweather', 'Roboto Slab', 'Noto Serif'],
};
const ALL_FONTS = [...FONTS.sans, ...FONTS.serif];
export const pickFont = (f, def) => (ALL_FONTS.includes(f) ? f : def);

// ---------- màu ----------
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
export function hex(v, def) {
  const m = HEX.exec(String(v || '').trim());
  if (!m) return def;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}
function lum(h) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** Màu chữ đọc được trên nền `bg` */
export const onColor = (bg, ink = '#111827') => (contrast(bg, '#ffffff') >= contrast(bg, ink) ? '#ffffff' : ink);

/** Chuẩn hoá bộ màu thương hiệu, đảm bảo chữ đọc được */
export function normalizeColors(c = {}) {
  let primary = hex(c.primary, '#1f5fbf');
  const accent = hex(c.accent, '#f59e0b');
  let ink = hex(c.ink, '#111827');
  let surface = hex(c.surface, '#ffffff');
  if (contrast(ink, surface) < 7) { ink = lum(surface) > 0.5 ? '#111827' : '#f9fafb'; }
  // màu chính phải đủ nổi trên nền để làm chữ/nút
  if (contrast(primary, surface) < 3) primary = lum(surface) > 0.5 ? '#1f2937' : '#e5e7eb';
  return { primary, accent, ink, surface };
}

/** CSS biến màu + lớp tiện ích (màu đặc, không gradient) */
export function cssVars(colors) {
  const { primary, accent, ink, surface } = colors;
  return `:root{--p:${primary};--a:${accent};--ink:${ink};--surface:${surface};--on-p:${onColor(primary)};--on-a:${onColor(accent)};
--muted:color-mix(in srgb,var(--ink) 62%,var(--surface));--line:color-mix(in srgb,var(--ink) 12%,var(--surface));
--soft:color-mix(in srgb,var(--p) 7%,var(--surface));--cream:color-mix(in srgb,#f3ead8 55%,var(--surface));
--dark:color-mix(in srgb,var(--ink) 92%,var(--p));}
.bg-p{background:var(--p);color:var(--on-p)}.bg-a{background:var(--a);color:var(--on-a)}.text-p{color:var(--p)}.text-a{color:var(--a)}
.text-ink{color:var(--ink)}.text-muted{color:var(--muted)}.bg-surface{background:var(--surface)}.bg-dark{background:var(--dark);color:#fff}
.border-p{border-color:var(--p)}.ring-p{--tw-ring-color:var(--p)}.bg-soft{background:var(--soft)}`;
}
