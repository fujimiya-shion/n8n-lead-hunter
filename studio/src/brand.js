// Thương hiệu của 1 bộ demo: font (Google Fonts có tiếng Việt), bộ màu (đảm bảo chữ đọc được), khung trang HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Google Fonts có hỗ trợ tiếng Việt
// (đã kiểm tra: tất cả đều có subset vietnamese trên Google Fonts)
export const FONTS = {
  sans: ['Be Vietnam Pro', 'Inter', 'Montserrat', 'Nunito', 'Quicksand', 'Lexend', 'Roboto', 'Open Sans', 'Plus Jakarta Sans',
    'Manrope', 'Archivo', 'Epilogue', 'Barlow', 'Josefin Sans', 'Space Grotesk', 'Bricolage Grotesque'],
  mono: ['Space Mono', 'JetBrains Mono'],
  serif: ['Playfair Display', 'Lora', 'Merriweather', 'Roboto Slab', 'Noto Serif', 'Cormorant Garamond', 'Prata', 'Fraunces'],
  rounded: ['Baloo 2', 'Mali', 'Comfortaa', 'Grandstander', 'Itim', 'Patrick Hand', 'Bangers'],
  condensed: ['Oswald', 'Anton', 'Barlow Condensed', 'Saira Condensed', 'Chakra Petch', 'Phudu'],
  script: ['Pacifico', 'Lobster', 'Dancing Script'],
};
const ALL_FONTS = Object.values(FONTS).flat();
const BODY_FONTS = [...FONTS.sans, ...FONTS.serif, 'Mali', 'Itim', 'Patrick Hand'];
/** Font thân bài phải dễ đọc (không dùng font chữ đứng hẹp / viết tay cho đoạn văn dài) */
export const pickBodyFont = (f, def) => (BODY_FONTS.includes(f) ? f : def);
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
  // 2 màu phụ (tuỳ phong cách: vui tươi dùng nhiều màu, tối giản gần như không dùng)
  const secondary = hex(c.secondary, accent);
  const highlight = hex(c.highlight, accent);
  return { primary, accent, ink, surface, secondary, highlight };
}

/** CSS biến màu + lớp tiện ích (màu đặc, không gradient) */
export function cssVars(colors) {
  const { primary, accent, ink, surface } = colors;
  const secondary = colors.secondary || accent, highlight = colors.highlight || accent;
  return `:root{--p:${primary};--a:${accent};--ink:${ink};--surface:${surface};--on-p:${onColor(primary)};--on-a:${onColor(accent)};
--s:${secondary};--h:${highlight};--on-s:${onColor(secondary)};--on-h:${onColor(highlight)};
--muted:color-mix(in srgb,var(--ink) 62%,var(--surface));--line:color-mix(in srgb,var(--ink) 12%,var(--surface));
--soft:color-mix(in srgb,var(--p) 7%,var(--surface));--cream:color-mix(in srgb,#f3ead8 55%,var(--surface));
--dark:color-mix(in srgb,var(--ink) 92%,var(--p));}
.bg-p{background:var(--p);color:var(--on-p)}.bg-a{background:var(--a);color:var(--on-a)}.text-p{color:var(--p)}.text-a{color:var(--a)}
.text-ink{color:var(--ink)}.text-muted{color:var(--muted)}.bg-surface{background:var(--surface)}.bg-dark{background:var(--dark);color:#fff}
.border-p{border-color:var(--p)}.ring-p{--tw-ring-color:var(--p)}.bg-soft{background:var(--soft)}`;
}

/** Khung trang hoàn chỉnh: font + biến màu + Tailwind (màu thương hiệu thành class primary/accent/ink/...) */
export function shell({ plan, title, body }) {
  const b = plan.brand;
  const headFont = b.font_heading;
  const fonts = [...new Set([headFont, b.font_body])].map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700;800`).join('&');
  const tw = { theme: { extend: {
    colors: { primary: 'var(--p)', accent: 'var(--a)', ink: 'var(--ink)', muted: 'var(--muted)', surface: 'var(--surface)',
      soft: 'var(--soft)', line: 'var(--line)', cream: 'var(--cream)', dark: 'var(--dark)', 'on-primary': 'var(--on-p)', 'on-accent': 'var(--on-a)',
      secondary: 'var(--s)', highlight: 'var(--h)', 'on-secondary': 'var(--on-s)', 'on-highlight': 'var(--on-h)' },
    fontFamily: { head: [`'${headFont}'`, 'Georgia', 'serif'], sans: [`'${b.font_body}'`, 'system-ui', 'sans-serif'] },
  } } };
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?${fonts}&display=swap" rel="stylesheet">
<script src="https://cdn.tailwindcss.com/3.4.16"></script>
<script>tailwind.config=${JSON.stringify(tw)}</script>
<style>${cssVars(b.colors)}
body{font-family:'${b.font_body}',system-ui,sans-serif;background:var(--surface);color:var(--ink);-webkit-font-smoothing:antialiased}
.font-head{font-family:'${headFont}',Georgia,serif}details summary::-webkit-details-marker{display:none}</style>
</head><body>
${body}
</body></html>`;
}

/** Bọc nội dung thành hộp thoại nổi trên nền trang (dạng modal) */
