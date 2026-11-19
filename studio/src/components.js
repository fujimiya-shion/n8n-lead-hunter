// Thư viện thành phần CHUNG (không gắn ngành). Mỗi section dựng theo (type, variant) + quy tắc của phong cách trang.
// Mọi chữ đều escape. Màu đặc qua biến CSS (styles.js), không gradient; bóng chỉ khi phong cách cho phép.
import { STYLES, FONTS, cssVars } from './styles.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 'mx-auto max-w-6xl px-5';
const tel = (p) => `tel:${String(p || '').replace(/[^\d+]/g, '')}`;
const initials = (n) => String(n || '').split(/\s+/).filter((w) => /^[\p{L}\d]/u.test(w)).slice(-2).map((w) => w[0]).join('').toUpperCase() || '•';
const stars = (n = 5) => `<span class="inline-flex gap-0.5 text-[color:var(--a)]">${icon('star', 'h-4 w-4 fill-current').repeat(Math.max(1, Math.min(5, n)))}</span>`;

// ---------- primitives ----------
function btn(ctx, label, { primary = true, dark = false, href } = {}) {
  if (!label) return '';
  const st = ctx.st;
  const cls = primary ? `bg-p ${st.shadow}` : dark ? 'border border-white/40 text-white' : 'border border-[color:var(--line)] text-ink bg-white';
  return `<a href="${href || tel(ctx.phone)}" class="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold ${st.btn} ${cls}">${primary ? icon('phone', 'h-4 w-4') : ''}${esc(label)}</a>`;
}
function media(ctx, s, img, cls = 'aspect-[4/3]', iconName = 'image') {
  const st = ctx.st;
  if (img?.url) return `<img src="${esc(img.url)}" alt="${esc(img.alt)}" class="w-full ${cls} object-cover ${st.img}" loading="eager">`;
  if (s?.illustrationSvg) return `<div class="w-full ${cls} ${st.img} bg-soft grid place-items-center p-10"><div class="w-2/5 max-w-[220px] [&>svg]:h-auto [&>svg]:w-full">${s.illustrationSvg}</div></div>`;
  return ''; // không có ảnh thật → không vẽ ô trống (adapt() đã đổi sang bố cục không cần ảnh)
}
const ic = (name, fallback, cls = 'h-6 w-6') => icon(name || fallback, cls, fallback);
function head(ctx, s, { center = false, dark = false } = {}) {
  const st = ctx.st;
  if (!s.heading && !s.eyebrow) return '';
  return `<div class="${center ? 'mx-auto text-center' : ''} max-w-2xl mb-12">
    ${s.eyebrow ? `<div class="mb-4 ${st.eyebrow}">${esc(s.eyebrow)}</div>` : ''}
    ${s.heading ? `<h2 class="font-head ${st.h2} ${dark ? 'text-white' : 'text-ink'}">${esc(s.heading)}</h2>` : ''}
    ${s.subheading ? `<p class="mt-4 text-lg leading-relaxed ${dark ? 'text-white/75' : 'text-muted'}">${esc(s.subheading)}</p>` : ''}
  </div>`;
}
const wrap = (s, inner, cls = '') => `<section data-section="${s.type}" data-label="${esc(s.heading || s.type)}" class="${cls}">${inner}</section>`;

// ---------- sections ----------
const C = {
  navbar(s, ctx) {
    const st = ctx.st;
    const logo = `<div class="flex items-center gap-3"><span class="grid h-10 w-10 place-items-center bg-p font-head font-bold ${st.pill === 'rounded-full' ? 'rounded-full' : st.btn}">${esc(initials(ctx.name))}</span>
      <span class="font-head text-lg font-bold text-ink">${esc(ctx.logo)}</span></div>`;
    const links = (s.links.length ? s.links : ['Dịch vụ', 'Bảng giá', 'Liên hệ']).map((l) => `<a class="hover:text-p">${esc(l)}</a>`).join('');
    const cta = `<a href="${tel(ctx.phone)}" class="hidden sm:inline-flex items-center gap-2 bg-p px-4 py-2.5 text-sm font-semibold ${st.btn}">${icon('phone', 'h-4 w-4')}${esc(s.cta.label || ctx.phone)}</a>`;
    const top = s.variant === 'with-topbar' ? `<div class="bg-dark text-sm"><div class="${W} flex flex-wrap gap-x-6 gap-y-1 py-2 text-white/80">
      <span class="inline-flex items-center gap-1.5">${icon('phone', 'h-3.5 w-3.5')}${esc(ctx.phone)}</span>
      ${ctx.address ? `<span class="hidden md:inline-flex items-center gap-1.5">${icon('map-pin', 'h-3.5 w-3.5')}${esc(ctx.address)}</span>` : ''}</div></div>` : '';
    if (s.variant === 'centered') return wrap(s, `<div class="${W} flex flex-col items-center gap-4 py-6">${logo}<nav class="flex flex-wrap justify-center gap-7 text-sm font-medium text-muted">${links}</nav></div>`, 'bg-surface border-b border-[color:var(--line)]');
    return wrap(s, `${top}<div class="${W} flex items-center gap-8 py-5">${logo}<nav class="ml-auto hidden md:flex gap-8 text-sm font-medium text-muted">${links}</nav>${cta}</div>`, 'bg-surface border-b border-[color:var(--line)]');
  },

  hero(s, ctx) {
    const st = ctx.st, v = s.variant;
    const dark = ctx.style.darkHero && v !== 'image-background';
    const pts = s.items.slice(0, 3).map((x) => `<li class="flex items-center gap-2 ${dark ? 'text-white/85' : 'text-ink'}"><span class="text-p">${ic(x.icon, 'check', 'h-5 w-5')}</span>${esc(x.title)}</li>`).join('');
    const text = (center = false, onDark = dark) => `
      ${s.eyebrow ? `<div class="mb-5 ${st.eyebrow}">${esc(s.eyebrow)}</div>` : ''}
      <h1 class="font-head ${st.h1} ${onDark ? 'text-white' : 'text-ink'}">${esc(s.heading || ctx.name)}</h1>
      ${s.subheading ? `<p class="mt-6 text-lg md:text-xl leading-relaxed ${center ? 'mx-auto' : ''} max-w-xl ${onDark ? 'text-white/80' : 'text-muted'}">${esc(s.subheading)}</p>` : ''}
      <div class="mt-9 flex flex-wrap gap-3 ${center ? 'justify-center' : ''}">${btn(ctx, s.cta.label || 'Liên hệ ngay')}${btn(ctx, s.cta.secondary_label, { primary: false, dark: onDark, href: '#' })}</div>
      ${pts ? `<ul class="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm ${center ? 'justify-center' : ''}">${pts}</ul>` : ''}`;
    if (v === 'image-background') {
      const bg = s.image?.url ? `<img src="${esc(s.image.url)}" alt="${esc(s.image.alt)}" class="absolute inset-0 h-full w-full object-cover"><div class="absolute inset-0 bg-black/55"></div>` : '<div class="absolute inset-0 bg-dark"></div>';
      return wrap(s, `${bg}<div class="relative ${W} py-28 md:py-40"><div class="max-w-2xl">${text(false, true)}</div></div>`, 'relative overflow-hidden');
    }
    if (v === 'centered') return wrap(s, `<div class="${W} ${st.pad} text-center"><div class="mx-auto max-w-3xl">${text(true)}</div>
      ${s.image || s.illustrationSvg ? `<div class="mt-16">${media(ctx, s, s.image, 'aspect-[21/9]')}</div>` : ''}</div>`, dark ? 'bg-dark' : 'bg-surface');
    if (v === 'minimal-text') return wrap(s, `<div class="${W} ${st.pad}"><div class="max-w-4xl">${text()}</div></div>`, dark ? 'bg-dark' : 'bg-surface');
    if (v === 'split-card') {
      const card = `<div class="${st.card} ${st.shadow} p-7 md:p-8">
        <div class="text-sm font-semibold text-muted">Liên hệ nhanh</div>
        <a href="${tel(ctx.phone)}" class="mt-3 flex items-center gap-3 font-head text-2xl md:text-3xl font-bold text-ink">${icon('phone', 'h-6 w-6 text-p')}${esc(ctx.phone)}</a>
        ${ctx.address ? `<div class="mt-4 flex gap-3 text-muted">${icon('map-pin', 'h-5 w-5 shrink-0 text-p')}<span>${esc(ctx.address)}</span></div>` : ''}
        ${s.items.length ? `<ul class="mt-6 space-y-3 border-t border-[color:var(--line)] pt-6">${s.items.map((x) => `<li class="flex items-center gap-3 text-ink"><span class="grid h-9 w-9 shrink-0 place-items-center bg-soft text-p ${st.pill}">${ic(x.icon, 'check', 'h-4 w-4')}</span>${esc(x.title)}</li>`).join('')}</ul>` : ''}
        <a href="${tel(ctx.phone)}" class="mt-7 flex w-full items-center justify-center gap-2 bg-p py-3.5 font-semibold ${st.btn}">${esc(s.cta.label || 'Gọi ngay')}</a></div>`;
      const t2 = `${s.eyebrow ? `<div class="mb-5 ${st.eyebrow}">${esc(s.eyebrow)}</div>` : ''}<h1 class="font-head ${st.h1} ${dark ? 'text-white' : 'text-ink'}">${esc(s.heading || ctx.name)}</h1>
        ${s.subheading ? `<p class="mt-6 text-lg md:text-xl leading-relaxed max-w-xl ${dark ? 'text-white/80' : 'text-muted'}">${esc(s.subheading)}</p>` : ''}
        <div class="mt-9 flex flex-wrap gap-3">${btn(ctx, s.cta.secondary_label || 'Xem dịch vụ', { primary: false, dark, href: '#' })}</div>`;
      return wrap(s, `<div class="${W} ${st.pad} grid items-center gap-12 md:grid-cols-[1.25fr_1fr]"><div>${t2}</div>${card}</div>`, dark ? 'bg-dark' : 'bg-surface');
    }
    const visual = v === 'illustration' ? media(ctx, { illustrationSvg: s.illustrationSvg }, null, 'aspect-square') : media(ctx, s, s.image, 'aspect-[4/5] md:aspect-[4/5]');
    return wrap(s, `<div class="${W} ${st.pad} grid items-center gap-12 md:grid-cols-[1.1fr_1fr]"><div>${text()}</div><div>${visual}</div></div>`, dark ? 'bg-dark' : 'bg-surface');
  },

  trust_bar(s, ctx) {
    if (s.variant === 'text-row') return wrap(s, `<div class="${W} flex flex-wrap justify-center gap-x-10 gap-y-3 py-7 text-sm font-semibold text-muted">${s.items.map((x) => `<span>${esc(x.title)}</span>`).join('<span class="text-p">•</span>')}</div>`, 'border-y border-[color:var(--line)] bg-surface');
    return wrap(s, `<div class="${W} grid grid-cols-2 gap-6 py-10 md:grid-cols-${Math.min(5, Math.max(2, s.items.length))}">
      ${s.items.map((x) => `<div class="flex items-center gap-3"><span class="text-p">${ic(x.icon, 'badge-check')}</span><span class="text-sm font-semibold text-ink">${esc(x.title)}</span></div>`).join('')}</div>`, 'border-y border-[color:var(--line)] bg-surface');
  },

  stats(s, ctx) {
    const st = ctx.st, n = Math.max(2, Math.min(4, s.items.length));
    const cell = (x) => `<div class="${s.variant === 'cards' ? `${st.card} p-6` : ''}"><div class="font-head text-4xl md:text-5xl font-bold text-p">${esc(x.value)}</div><div class="mt-2 text-sm text-muted">${esc(x.label || x.title)}</div></div>`;
    return wrap(s, `<div class="${W} py-14">${s.heading ? `<h2 class="font-head mb-10 text-2xl font-bold text-ink">${esc(s.heading)}</h2>` : ''}
      <div class="grid grid-cols-2 gap-8 md:grid-cols-${n}">${s.items.map(cell).join('')}</div></div>`, s.variant === 'cards' ? ctx.st.alt : 'bg-surface');
  },

  services(s, ctx) {
    const st = ctx.st, v = s.variant;
    let body;
    if (v === 'list-rows') {
      body = `<div class="divide-y divide-[color:var(--line)] border-y border-[color:var(--line)]">${s.items.map((x) => `
        <div class="grid gap-3 py-7 md:grid-cols-[auto_1fr_2fr_auto] md:items-center md:gap-8"><span class="text-p">${ic(x.icon, 'check')}</span>
        <h3 class="font-head text-xl font-semibold text-ink">${esc(x.title)}</h3><p class="text-muted">${esc(x.text)}</p>
        <span class="font-semibold text-ink whitespace-nowrap">${esc(x.price)}</span></div>`).join('')}</div>`;
    } else if (v === 'image-cards') {
      body = `<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => `<article class="${st.card} ${st.shadow} overflow-hidden">
        ${media(ctx, null, x.image, 'aspect-[16/10]', x.icon || 'image').replace(st.img, '')}
        <div class="p-6"><h3 class="font-head text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-2 text-muted leading-relaxed">${esc(x.text)}</p>
        ${x.price ? `<div class="mt-4 font-semibold text-p">${esc(x.price)}</div>` : ''}</div></article>`).join('')}</div>`;
    } else {
      body = `<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => `<article class="${st.card} ${st.shadow} p-7">
        <span class="grid h-12 w-12 place-items-center bg-soft text-p ${st.pill}">${ic(x.icon, 'check')}</span>
        <h3 class="font-head mt-5 text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-2 text-muted leading-relaxed">${esc(x.text)}</p>
        ${x.price ? `<div class="mt-4 text-sm font-semibold text-p">${esc(x.price)}</div>` : ''}</article>`).join('')}</div>`;
    }
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}${body}</div>`, v === 'list-rows' ? 'bg-surface' : st.alt);
  },

  feature_list(s, ctx) {
    const st = ctx.st, v = s.variant;
    if (v === 'alternating') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="space-y-20">${s.items.map((x, i) => `
      <div class="grid items-center gap-10 md:grid-cols-2"><div class="${i % 2 ? 'md:order-2' : ''}">${media(ctx, null, x.image, 'aspect-[4/3]', x.icon || 'image')}</div>
      <div><span class="text-p">${ic(x.icon, 'check', 'h-8 w-8')}</span><h3 class="font-head mt-4 text-2xl md:text-3xl font-semibold text-ink">${esc(x.title)}</h3>
      <p class="mt-4 text-lg leading-relaxed text-muted">${esc(x.text)}</p></div></div>`).join('')}</div></div>`, 'bg-surface');
    if (v === 'icon-grid') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s, { center: true })}<div class="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      ${s.items.map((x) => `<div><span class="text-p">${ic(x.icon, 'check', 'h-8 w-8')}</span><h3 class="font-head mt-4 text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-2 text-muted leading-relaxed">${esc(x.text)}</p></div>`).join('')}</div></div>`, 'bg-surface');
    return wrap(s, `<div class="${W} ${st.pad} grid gap-14 lg:grid-cols-2 lg:items-start"><div>${head(ctx, s)}${s.body ? `<p class="-mt-6 mb-8 text-lg leading-relaxed text-muted">${esc(s.body)}</p>` : ''}${s.image || s.illustrationSvg ? media(ctx, s, s.image, 'aspect-[4/3]') : ''}</div>
      <ul class="space-y-7">${s.items.map((x) => `<li class="flex gap-5"><span class="mt-1 grid h-11 w-11 shrink-0 place-items-center bg-soft text-p ${st.pill}">${ic(x.icon, 'check', 'h-5 w-5')}</span>
      <div><h3 class="font-head text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-1.5 text-muted leading-relaxed">${esc(x.text)}</p></div></li>`).join('')}</ul></div>`, st.alt);
  },

  about(s, ctx) {
    const st = ctx.st;
    const facts = s.items.length ? `<dl class="mt-10 grid grid-cols-2 gap-6">${s.items.map((x) => `<div class="border-l-2 border-p pl-4"><dt class="font-head font-semibold text-ink">${esc(x.title)}</dt><dd class="mt-1 text-sm text-muted">${esc(x.text)}</dd></div>`).join('')}</dl>` : '';
    const text = `${s.eyebrow ? `<div class="mb-4 ${st.eyebrow}">${esc(s.eyebrow)}</div>` : ''}<h2 class="font-head ${st.h2} text-ink">${esc(s.heading)}</h2>
      <p class="mt-6 text-lg leading-relaxed text-muted">${esc(s.body || s.subheading)}</p>${facts}`;
    if (s.variant === 'text-only') return wrap(s, `<div class="${W} ${st.pad}"><div class="mx-auto max-w-3xl text-center">${text}</div></div>`, 'bg-surface');
    const img = media(ctx, s, s.image, 'aspect-[4/5]');
    return wrap(s, `<div class="${W} ${st.pad} grid items-center gap-14 md:grid-cols-2">${s.variant === 'image-right' ? `<div>${text}</div><div>${img}</div>` : `<div>${img}</div><div>${text}</div>`}</div>`, 'bg-surface');
  },

  team(s, ctx) {
    const st = ctx.st;
    const avatar = (x, size) => (x.image?.url ? `<img src="${esc(x.image.url)}" alt="${esc(x.name)}" class="${size} object-cover ${st.img}">`
      : `<div class="${size} grid place-items-center bg-soft font-head text-2xl font-bold text-p ${st.img}">${esc(initials(x.name || x.title))}</div>`);
    if (s.variant === 'compact') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => `
      <div class="flex items-center gap-4">${avatar(x, 'h-16 w-16 shrink-0 !rounded-full')}<div><div class="font-head font-semibold text-ink">${esc(x.name || x.title)}</div><div class="text-sm text-p">${esc(x.role)}</div></div></div>`).join('')}</div></div>`, 'bg-surface');
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => `
      <article>${avatar(x, 'w-full aspect-[4/5]')}<h3 class="font-head mt-5 text-lg font-semibold text-ink">${esc(x.name || x.title)}</h3><div class="text-sm font-medium text-p">${esc(x.role)}</div>
      ${x.text ? `<p class="mt-2 text-sm leading-relaxed text-muted">${esc(x.text)}</p>` : ''}</article>`).join('')}</div></div>`, st.alt);
  },

  gallery(s, ctx) {
    const st = ctx.st;
    const tile = (x, ratio) => `<figure class="break-inside-avoid mb-6">${media(ctx, null, x.image, ratio, 'image')}<figcaption class="mt-3"><div class="font-semibold text-ink">${esc(x.title)}</div>${x.meta ? `<div class="text-sm text-muted">${esc(x.meta)}</div>` : ''}</figcaption></figure>`;
    const body = s.variant === 'masonry'
      ? `<div class="columns-1 gap-6 sm:columns-2 lg:columns-3">${s.items.map((x, i) => tile(x, ['aspect-[4/5]', 'aspect-square', 'aspect-[4/3]'][i % 3])).join('')}</div>`
      : `<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => tile(x, 'aspect-[4/3]')).join('')}</div>`;
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}${body}</div>`, 'bg-surface');
  },

  process(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'timeline-vertical') return wrap(s, `<div class="${W} ${st.pad} grid gap-12 md:grid-cols-[1fr_1.4fr]"><div>${head(ctx, s)}</div>
      <ol class="relative border-l-2 border-[color:var(--line)] pl-8 space-y-10">${s.items.map((x, i) => `<li class="relative"><span class="absolute -left-[45px] grid h-8 w-8 place-items-center bg-p text-sm font-bold ${st.pill === 'rounded-none' ? '' : 'rounded-full'}">${i + 1}</span>
      <h3 class="font-head text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-1.5 text-muted leading-relaxed">${esc(x.text)}</p></li>`).join('')}</ol></div>`, st.alt);
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<ol class="grid gap-8 sm:grid-cols-2 ${{ 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-3' }[s.items.length] || 'lg:grid-cols-3'}">${s.items.map((x, i) => `
      <li class="border-t-2 ${i === 0 ? 'border-p' : 'border-[color:var(--line)]'} pt-6"><div class="font-head text-sm font-bold text-p">BƯỚC ${String(i + 1).padStart(2, '0')}</div>
      <h3 class="font-head mt-3 text-lg font-semibold text-ink">${esc(x.title)}</h3><p class="mt-2 text-muted leading-relaxed">${esc(x.text)}</p></li>`).join('')}</ol></div>`, st.alt);
  },

  pricing(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'table') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="overflow-hidden border border-[color:var(--line)] ${st.img} bg-white">
      <table class="w-full text-left"><thead class="bg-soft text-sm text-ink"><tr><th class="p-5 font-semibold">Gói</th><th class="p-5 font-semibold">Bao gồm</th><th class="p-5 font-semibold text-right">Giá</th></tr></thead>
      <tbody class="divide-y divide-[color:var(--line)]">${s.items.map((x) => `<tr class="${x.featured ? 'bg-soft' : ''}"><td class="p-5 align-top"><div class="font-head font-semibold text-ink">${esc(x.title)}</div>${x.badge ? `<span class="mt-1 inline-block bg-p px-2 py-0.5 text-xs font-semibold ${st.pill}">${esc(x.badge)}</span>` : ''}</td>
      <td class="p-5 text-sm text-muted">${x.features.map(esc).join(' · ')}</td><td class="p-5 text-right align-top"><div class="font-head text-xl font-bold text-ink whitespace-nowrap">${esc(x.price)}</div>${x.unit ? `<div class="text-xs text-muted">/${esc(x.unit)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
      ${s.note ? `<p class="mt-4 text-sm text-muted">${esc(s.note)}</p>` : ''}</div>`, 'bg-surface');
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s, { center: true })}<div class="grid items-stretch gap-6 md:grid-cols-${Math.min(4, Math.max(2, s.items.length))}">${s.items.map((x) => `
      <div class="${st.card} ${x.featured ? '!border-2 !border-p' : ''} ${st.shadow} relative flex flex-col p-8">
      ${x.badge || x.featured ? `<span class="absolute -top-3 left-8 bg-p px-3 py-1 text-xs font-semibold ${st.pill}">${esc(x.badge || 'Phổ biến')}</span>` : ''}
      <h3 class="font-head text-lg font-semibold text-ink">${esc(x.title)}</h3>
      <div class="mt-4 flex items-baseline gap-1"><span class="font-head text-4xl font-bold text-ink">${esc(x.price)}</span>${x.unit ? `<span class="text-sm text-muted">/${esc(x.unit)}</span>` : ''}</div>
      <ul class="mt-6 flex-1 space-y-3 text-sm">${x.features.map((f) => `<li class="flex gap-2 text-muted"><span class="text-p">${icon('check', 'h-5 w-5')}</span>${esc(f)}</li>`).join('')}</ul>
      <a href="${tel(ctx.phone)}" class="mt-8 block py-3 text-center font-semibold ${st.btn} ${x.featured ? 'bg-p' : 'border border-[color:var(--line)] text-ink'}">Chọn gói này</a></div>`).join('')}</div>
      ${s.note ? `<p class="mt-6 text-center text-sm text-muted">${esc(s.note)}</p>` : ''}</div>`, st.alt);
  },

  price_list(s, ctx) {
    const st = ctx.st;
    const row = (x) => `<div class="py-4"><div class="flex items-baseline gap-3"><span class="font-semibold text-ink">${esc(x.title)}</span><span class="flex-1 border-b border-dotted border-[color:var(--line)]"></span><span class="font-head font-semibold text-p whitespace-nowrap">${esc(x.price)}</span></div>${x.text ? `<p class="mt-1 text-sm text-muted">${esc(x.text)}</p>` : ''}</div>`;
    let body;
    if (s.variant === 'grouped') {
      const groups = [...new Set(s.items.map((x) => x.group || 'Khác'))];
      body = `<div class="grid gap-12 md:grid-cols-2">${groups.map((g) => `<div><h3 class="font-head mb-2 border-b-2 border-p pb-3 text-xl font-semibold text-ink">${esc(g)}</h3>${s.items.filter((x) => (x.group || 'Khác') === g).map(row).join('')}</div>`).join('')}</div>`;
    } else body = `<div class="grid gap-x-16 md:grid-cols-2">${s.items.map(row).join('')}</div>`;
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}${body}${s.note ? `<p class="mt-8 text-sm text-muted">${esc(s.note)}</p>` : ''}</div>`, 'bg-surface');
  },

  schedule(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'cards') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">${s.items.map((x) => `
      <div class="${st.card} ${st.shadow} p-6"><div class="flex items-center justify-between gap-3"><span class="text-sm font-semibold text-p">${esc(x.day)}</span>${x.badge ? `<span class="bg-soft px-2 py-0.5 text-xs font-semibold text-p ${st.pill}">${esc(x.badge)}</span>` : ''}</div>
      <h3 class="font-head mt-3 text-lg font-semibold text-ink">${esc(x.title)}</h3><div class="mt-3 flex items-center gap-2 text-sm text-muted">${icon('clock', 'h-4 w-4')}${esc(x.time)}</div>${x.meta ? `<div class="mt-1 text-sm text-muted">${esc(x.meta)}</div>` : ''}</div>`).join('')}</div></div>`, st.alt);
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="overflow-x-auto border border-[color:var(--line)] ${st.img} bg-white"><table class="w-full text-left text-sm">
      <thead class="bg-soft text-ink"><tr><th class="p-4 font-semibold">Nội dung</th><th class="p-4 font-semibold">Ngày</th><th class="p-4 font-semibold">Giờ</th><th class="p-4 font-semibold">Ghi chú</th></tr></thead>
      <tbody class="divide-y divide-[color:var(--line)]">${s.items.map((x) => `<tr><td class="p-4 font-semibold text-ink">${esc(x.title)} ${x.badge ? `<span class="ml-2 bg-p px-2 py-0.5 text-xs ${st.pill}">${esc(x.badge)}</span>` : ''}</td><td class="p-4 text-muted">${esc(x.day)}</td><td class="p-4 text-muted">${esc(x.time)}</td><td class="p-4 text-muted">${esc(x.meta)}</td></tr>`).join('')}</tbody></table></div></div>`, st.alt);
  },

  testimonials(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'single-quote' && s.items[0]) {
      const x = s.items[0];
      return wrap(s, `<div class="${W} ${st.pad} text-center"><div class="mx-auto max-w-3xl">${stars(x.rating)}<blockquote class="font-head mt-6 text-2xl md:text-3xl leading-snug text-ink">“${esc(x.quote)}”</blockquote>
        <div class="mt-8 font-semibold text-ink">${esc(x.name)}</div><div class="text-sm text-muted">${esc(x.role)}</div></div></div>`, st.alt);
    }
    return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="grid gap-6 md:grid-cols-${Math.min(3, Math.max(1, s.items.length))}">${s.items.map((x) => `
      <figure class="${st.card} ${st.shadow} flex flex-col p-7">${stars(x.rating)}<blockquote class="mt-4 flex-1 leading-relaxed text-ink">“${esc(x.quote)}”</blockquote>
      <figcaption class="mt-6 flex items-center gap-3"><span class="grid h-10 w-10 place-items-center bg-soft text-sm font-bold text-p rounded-full">${esc(initials(x.name))}</span>
      <span><span class="block font-semibold text-ink">${esc(x.name)}</span><span class="block text-sm text-muted">${esc(x.role)}</span></span></figcaption></figure>`).join('')}</div></div>`, 'bg-surface');
  },

  faq(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'two-column') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<dl class="grid gap-x-14 gap-y-10 md:grid-cols-2">${s.items.map((x) => `<div><dt class="font-head text-lg font-semibold text-ink">${esc(x.q)}</dt><dd class="mt-2 leading-relaxed text-muted">${esc(x.a)}</dd></div>`).join('')}</dl></div>`, 'bg-surface');
    return wrap(s, `<div class="${W} ${st.pad} grid gap-12 md:grid-cols-[1fr_1.6fr]"><div>${head(ctx, s)}</div><div class="divide-y divide-[color:var(--line)] border-y border-[color:var(--line)]">
      ${s.items.map((x, i) => `<details class="group py-6" ${i === 0 ? 'open' : ''}><summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">${esc(x.q)}<span class="text-p transition group-open:rotate-45">${icon('plus', 'h-5 w-5')}</span></summary>
      <p class="mt-3 leading-relaxed text-muted">${esc(x.a)}</p></details>`).join('')}</div></div>`, st.alt);
  },

  booking_form(s, ctx) {
    const st = ctx.st;
    const input = 'w-full border border-[color:var(--line)] bg-white px-4 py-3 text-ink placeholder:text-[color:var(--muted)] ' + (st.btn === 'rounded-full' ? 'rounded-2xl' : st.btn);
    const fields = (s.fields.length ? s.fields : [{ label: 'Họ và tên', type: 'text' }, { label: 'Số điện thoại', type: 'tel' }, { label: 'Ngày mong muốn', type: 'date' }, { label: 'Ghi chú', type: 'textarea' }])
      .map((f) => {
        const lab = `<label class="mb-2 block text-sm font-semibold text-ink">${esc(f.label)}</label>`;
        if (f.type === 'select') return `<div>${lab}<div class="${input} flex items-center justify-between"><span class="text-muted">${esc(f.placeholder || f.options[0] || 'Chọn')}</span>${icon('chevron-down', 'h-4 w-4 text-muted')}</div></div>`;
        if (f.type === 'time' && f.options.length) return `<div class="sm:col-span-2">${lab}<div class="flex flex-wrap gap-2">${f.options.map((o, i) => `<span class="border px-4 py-2 text-sm font-medium ${st.btn} ${i === 1 ? 'bg-p border-transparent' : 'border-[color:var(--line)] text-ink bg-white'}">${esc(o)}</span>`).join('')}</div></div>`;
        if (f.type === 'textarea') return `<div class="sm:col-span-2">${lab}<div class="${input} h-28 text-muted">${esc(f.placeholder)}</div></div>`;
        const ico = { date: 'calendar', time: 'clock', tel: 'phone' }[f.type];
        return `<div>${lab}<div class="${input} flex items-center justify-between"><span class="text-muted">${esc(f.placeholder || (f.type === 'date' ? 'dd/mm/yyyy' : ''))}</span>${ico ? icon(ico, 'h-4 w-4 text-muted') : ''}</div></div>`;
      }).join('');
    const steps = s.variant === 'steps' ? `<ol class="mb-8 flex flex-wrap items-center gap-3 text-sm font-semibold">${['Chọn dịch vụ', 'Chọn thời gian', 'Thông tin liên hệ'].map((t, i) => `<li class="flex items-center gap-2 ${i === 0 ? 'text-p' : 'text-muted'}"><span class="grid h-7 w-7 place-items-center rounded-full ${i === 0 ? 'bg-p' : 'border border-[color:var(--line)]'}">${i + 1}</span>${t}</li>`).join('<span class="h-px w-8 bg-[color:var(--line)]"></span>')}</ol>` : '';
    const form = `<div class="${st.card} ${st.shadow} p-7 md:p-9">${steps}<div class="grid gap-5 sm:grid-cols-2">${fields}</div>
      <a class="mt-7 flex w-full items-center justify-center gap-2 bg-p py-4 font-semibold ${st.btn}">${icon('calendar-check', 'h-5 w-5', 'calendar')}${esc(s.cta.label || 'Gửi yêu cầu đặt lịch')}</a>
      ${s.note ? `<p class="mt-4 text-center text-xs text-muted">${esc(s.note)}</p>` : ''}</div>`;
    const info = `${head(ctx, s)}${s.items.length ? `<ul class="-mt-4 space-y-5">${s.items.map((x) => `<li class="flex gap-4"><span class="grid h-11 w-11 shrink-0 place-items-center bg-soft text-p ${st.pill}">${ic(x.icon, 'check', 'h-5 w-5')}</span><div><div class="font-semibold text-ink">${esc(x.title)}</div><div class="text-sm text-muted">${esc(x.text)}</div></div></li>`).join('')}</ul>` : ''}
      ${s.illustrationSvg ? `<div class="mt-10 hidden w-40 md:block [&>svg]:h-auto [&>svg]:w-full">${s.illustrationSvg}</div>` : ''}`;
    if (s.variant === 'centered' || s.variant === 'steps') return wrap(s, `<div class="${W} ${st.pad}"><div class="mx-auto max-w-3xl">${head(ctx, s, { center: true })}${form}</div></div>`, st.alt);
    return wrap(s, `<div class="${W} ${st.pad} grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-start"><div>${info}</div>${form}</div>`, st.alt);
  },

  contact(s, ctx) {
    const st = ctx.st;
    const base = [{ title: 'Điện thoại', text: ctx.phone, icon: 'phone' }, ...(ctx.address ? [{ title: 'Địa chỉ', text: ctx.address, icon: 'map-pin' }] : [])];
    const items = [...base, ...s.items].slice(0, 5);
    const cards = items.map((x) => `<div class="${s.variant === 'cards' ? `${st.card} p-6` : 'flex gap-4'}"><span class="${s.variant === 'cards' ? 'mb-4 ' : ''}grid h-11 w-11 shrink-0 place-items-center bg-soft text-p ${st.pill}">${ic(x.icon, 'info', 'h-5 w-5')}</span><div><div class="font-semibold text-ink">${esc(x.title)}</div><div class="mt-0.5 text-muted">${esc(x.text)}</div></div></div>`).join('');
    if (s.variant === 'cards') return wrap(s, `<div class="${W} ${st.pad}">${head(ctx, s)}<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-${Math.min(4, items.length)}">${cards}</div></div>`, 'bg-surface');
    const map = `<div class="relative aspect-[4/3] overflow-hidden ${st.img} border border-[color:var(--line)] bg-soft">
      <div class="absolute inset-0 opacity-60" style="background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:40px 40px"></div>
      <div class="absolute left-[10%] right-[30%] top-1/2 h-3 -translate-y-1/2 bg-white"></div><div class="absolute bottom-0 top-0 left-[55%] w-3 bg-white"></div>
      <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-center"><span class="inline-grid h-12 w-12 place-items-center bg-p rounded-full">${icon('map-pin', 'h-6 w-6')}</span>
      <div class="mt-2 whitespace-nowrap bg-white px-3 py-1.5 text-sm font-semibold text-ink ${st.btn}">${esc(ctx.logo)}</div></div></div>`;
    return wrap(s, `<div class="${W} ${st.pad} grid gap-12 md:grid-cols-2 md:items-center"><div>${head(ctx, s)}<div class="space-y-6">${cards}</div></div>${map}</div>`, 'bg-surface');
  },

  cta(s, ctx) {
    const st = ctx.st;
    if (s.variant === 'minimal') return wrap(s, `<div class="${W} ${st.pad} border-t border-[color:var(--line)] text-center"><h2 class="font-head ${st.h2} text-ink">${esc(s.heading || 'Liên hệ để được tư vấn miễn phí')}</h2>
      ${s.subheading ? `<p class="mx-auto mt-4 max-w-xl text-lg text-muted">${esc(s.subheading)}</p>` : ''}<div class="mt-8 flex flex-wrap justify-center gap-3">${btn(ctx, s.cta.label || 'Gọi ngay')}${btn(ctx, s.cta.secondary_label, { primary: false, href: '#' })}</div></div>`, 'bg-surface');
    if (s.variant === 'split') return wrap(s, `<div class="${W} py-16"><div class="grid overflow-hidden ${st.img} bg-dark md:grid-cols-2"><div class="p-10 md:p-14"><h2 class="font-head ${st.h2} text-white">${esc(s.heading)}</h2>
      ${s.subheading ? `<p class="mt-4 text-lg text-white/75">${esc(s.subheading)}</p>` : ''}<div class="mt-8 flex flex-wrap gap-3">${btn(ctx, s.cta.label || 'Gọi ngay')}${btn(ctx, s.cta.secondary_label, { primary: false, dark: true, href: '#' })}</div></div>
      <div class="min-h-[260px]">${media(ctx, s, s.image, 'h-full min-h-[260px]').replace(st.img, '')}</div></div></div>`, 'bg-surface');
    return wrap(s, `<div class="${W} py-20 md:py-24 flex flex-col gap-8 md:flex-row md:items-center md:justify-between"><div class="max-w-2xl"><h2 class="font-head ${st.h2}">${esc(s.heading || 'Liên hệ để được tư vấn miễn phí')}</h2>
      ${s.subheading ? `<p class="mt-4 text-lg opacity-85">${esc(s.subheading)}</p>` : ''}</div>
      <a href="${tel(ctx.phone)}" class="inline-flex shrink-0 items-center gap-2 bg-white px-7 py-4 font-semibold text-ink ${st.btn}">${icon('phone', 'h-5 w-5')}${esc(s.cta.label || ctx.phone)}</a></div>`, 'bg-p');
  },

  footer(s, ctx) {
    const credit = ctx.credits.length ? `<span>Ảnh: ${ctx.credits.map(esc).join(', ')}</span>` : '';
    const year = new Date().getFullYear();
    if (s.variant === 'columns') return wrap(s, `<div class="${W} grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
      <div><div class="font-head text-lg font-bold text-white">${esc(ctx.logo)}</div><p class="mt-3 max-w-sm text-sm text-white/65">${esc(s.body)}</p></div>
      <div><div class="mb-3 text-sm font-semibold text-white">Liên kết</div><ul class="space-y-2 text-sm text-white/65">${(s.links.length ? s.links : ['Dịch vụ', 'Bảng giá', 'Liên hệ']).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>
      <div><div class="mb-3 text-sm font-semibold text-white">Liên hệ</div><ul class="space-y-2 text-sm text-white/65"><li>${esc(ctx.phone)}</li>${ctx.address ? `<li>${esc(ctx.address)}</li>` : ''}</ul></div></div>
      <div class="border-t border-white/10"><div class="${W} flex flex-wrap justify-between gap-2 py-5 text-xs text-white/50"><span>© ${year} ${esc(ctx.logo)}</span>${credit}</div></div>`, 'bg-dark');
    return wrap(s, `<div class="${W} flex flex-col gap-3 py-10 text-sm text-muted md:flex-row md:items-center md:justify-between">
      <div><span class="font-head font-semibold text-ink">${esc(ctx.logo)}</span>${s.body ? ` — ${esc(s.body)}` : ''}</div>
      <div class="flex flex-wrap gap-x-5 gap-y-1"><span>${esc(ctx.phone)}</span>${ctx.address ? `<span>${esc(ctx.address)}</span>` : ''}<span>© ${year}</span>${credit}</div></div>`, 'border-t border-[color:var(--line)] bg-surface');
  },
};

/**
 * Thiếu ảnh thật → đổi sang bố cục không cần ảnh (không bao giờ vẽ ô xám trống).
 * Trả về null nếu section vô nghĩa khi không có ảnh (vd thư viện ảnh).
 */
export function adapt(s) {
  const has = (img) => Boolean(img?.url);
  const itemsWithImg = s.items.filter((x) => has(x.image)).length;
  const x = { ...s };
  switch (s.type) {
    case 'hero':
      if (['split-image', 'centered', 'image-background'].includes(s.variant) && !has(s.image)) x.variant = 'split-card';
      if (s.variant === 'illustration' && !s.illustrationSvg) x.variant = 'split-card';
      break;
    case 'about': if (!has(s.image) && s.variant !== 'text-only') x.variant = 'text-only'; break;
    case 'services': if (s.variant === 'image-cards' && itemsWithImg < s.items.length) x.variant = 'grid-cards'; break;
    case 'feature_list':
      if (s.variant === 'alternating' && itemsWithImg < s.items.length) x.variant = 'icon-grid';
      if (s.variant === 'two-column' && !has(s.image)) { x.image = null; x.illustrationSvg = null; }
      break;
    case 'gallery':
      if (itemsWithImg < 3) return null;
      x.items = s.items.filter((i) => has(i.image));
      break;
    case 'team': if (s.variant === 'cards' && itemsWithImg < s.items.length) x.variant = 'compact'; break;
    case 'cta': if (s.variant === 'split' && !has(s.image)) x.variant = 'banner'; break;
    default:
  }
  return x;
}

/**
 * Khung trang dùng chung cho CẢ 2 tab (template generic + HTML do LLM viết):
 * Tailwind + font + màu thương hiệu thành class (bg-primary, text-ink, text-muted, bg-surface, bg-soft, border-line, text-on-primary...).
 */
export function shell({ plan, style: styleName, title, body }) {
  const style = STYLES[styleName] || STYLES[plan.brand.style];
  const b = plan.brand;
  let headFont = b.font_heading;
  if (style?.serif && !FONTS.serif.includes(headFont)) headFont = 'Playfair Display';
  const fonts = [...new Set([headFont, b.font_body])].map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700;800`).join('&');
  const tw = { theme: { extend: {
    colors: { primary: 'var(--p)', accent: 'var(--a)', ink: 'var(--ink)', muted: 'var(--muted)', surface: 'var(--surface)',
      soft: 'var(--soft)', line: 'var(--line)', cream: 'var(--cream)', dark: 'var(--dark)', 'on-primary': 'var(--on-p)', 'on-accent': 'var(--on-a)' },
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
export function modalOverlay(backgroundBody, inner) {
  return `<div aria-hidden="true" class="pointer-events-none select-none">${backgroundBody}</div>
<div class="fixed inset-0 bg-black/55"></div>
<div class="fixed inset-0 flex items-center justify-center p-4 md:p-8">
  <div data-section="modal" data-label="modal" class="relative w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-xl bg-surface shadow-2xl">
    <span class="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-soft text-ink">${icon('x', 'h-4 w-4')}</span>
    <div class="max-h-[88vh] overflow-hidden [&_section]:!py-10">${inner}</div>
  </div>
</div>`;
}

/** Dựng phần thân (các section) bằng thư viện thành phần */
export function renderSections({ plan, style: styleName, sections, lead, credits = [], brandSvg = null }) {
  const style = STYLES[styleName] || STYLES[plan.brand.style];
  const b = plan.brand;
  const name = lead.name.split(/[|–—]/)[0].trim();
  const ctx = { st: style, style, name, logo: b.logo_text || name, phone: lead.phone || '', address: lead.address || '', credits, brandSvg };
  return sections.map(adapt).filter(Boolean).map((s) => (C[s.type] ? C[s.type](s, ctx) : '')).join('\n');
}

/** Dựng 1 màn hình của tab "Template generic": page đầy đủ, section rời, hoặc modal đè lên trang chủ */
export function renderPage({ plan, page, sections, lead, credits, brandSvg = null, homeBody = '' }) {
  const style = plan.brand.style || page.style;
  let body = renderSections({ plan, style, sections, lead, credits, brandSvg });
  if (page.kind === 'modal') body = modalOverlay(homeBody, body);
  const name = lead.name.split(/[|–—]/)[0].trim();
  return shell({ plan, style, title: `${page.title} – ${name}`, body });
}
