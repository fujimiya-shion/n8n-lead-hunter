// Chụp ảnh trang demo bằng Playwright. Dùng chung 1 Chromium cho cả service.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

let browserPromise = null;
function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] }).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

async function open(url, viewport, scale) {
  const b = await browser();
  const ctx = await b.newContext({ viewport, deviceScaleFactor: scale, locale: 'vi-VN' });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  // chờ font + ảnh tải xong
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))));
  }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page };
}

async function size(file) {
  const buf = await fs.readFile(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * Chụp 1 trang: toàn trang desktop (tối đa 6000px), mobile (tối đa 2600px), và từng section [data-section].
 * Trả về { shots: [...], summary } — summary dùng để LLM chấm điểm.
 */
export async function shootPage(url, dir, slug, title, { view = 'page', track = 'generic' } = {}) {
  const shots = [];
  const base = `${track}-${slug}`;
  const add = async (kind, file, extra = {}) => shots.push({ track, page: slug, title, view, kind, file, ...extra, ...(await size(`${dir}/${file}`)) });
  const modal = view === 'modal';

  // Desktop
  let { ctx, page } = await open(url, { width: 1440, height: 900 }, 1);
  let summary = '';
  try {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    // modal: chụp đúng khung màn hình (thấy hộp thoại đè lên trang); còn lại: toàn bộ nội dung
    await page.screenshot({ path: `${dir}/${base}-full.png`, fullPage: !modal, clip: modal ? undefined : { x: 0, y: 0, width: 1440, height: Math.min(h, 6000) }, animations: 'disabled' });
    await add('full', `${base}-full.png`);
    // modal: chỉ chụp riêng hộp thoại; còn lại: từng khối [data-section]
    // chỉ lấy khối ngoài cùng (bỏ khối lồng bên trong khối khác)
    const sections = await page.$$(modal ? '[data-section="modal"], [data-section$="modal"]' : '[data-section]:not([data-section] [data-section])');
    let covered = 0, count = 0;
    for (let i = 0; i < sections.length; i++) {
      const el = sections[i];
      const meta = await el.evaluate((e) => ({ type: e.dataset.section, label: e.dataset.label, h: e.getBoundingClientRect().height }));
      if (meta.h < 40) continue;
      const file = `${base}-s${String(i + 1).padStart(2, '0')}-${String(meta.type || 'khoi').replace(/[^\w-]/g, '')}.png`;
      await el.screenshot({ path: `${dir}/${file}`, animations: 'disabled' });
      await add('section', file, { section: meta.type, label: meta.label });
      covered += meta.h; count++;
    }
    // Không bắt được khối nào đủ tin cậy (thiếu data-section, hoặc khối chỉ phủ một phần nhỏ trang)
    // → chụp từng phần theo chiều cao màn hình (1440×900)
    if (!modal && (count === 0 || covered < h * 0.6)) {
      const tiles = Math.min(8, Math.ceil(Math.min(h, 7200) / 900));
      for (let t = 0; t < tiles; t++) {
        const y = t * 900, hh = Math.min(900, h - y);
        if (hh < 200) break;
        const file = `${base}-screen${t + 1}.png`;
        await page.screenshot({ path: `${dir}/${file}`, fullPage: true, clip: { x: 0, y, width: 1440, height: hh }, animations: 'disabled' });
        await add('section', file, { section: `screen-${t + 1}`, label: `Khung ${t + 1}` });
      }
    }
    summary = await page.evaluate(() => {
      const t = (sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
      return [`Tiêu đề: ${document.title}`, `H1: ${t('h1').join(' | ')}`,
        `Section: ${[...document.querySelectorAll('[data-section]')].map((e) => `${e.dataset.section}${e.dataset.label && e.dataset.label !== e.dataset.section ? ` "${e.dataset.label}"` : ''}`).join(' → ')}`,
        `Ảnh thật: ${document.querySelectorAll('img').length} · Trích: ${document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)}`].join('\n');
    });
  } finally { await ctx.close(); }

  // Mobile
  ({ ctx, page } = await open(url, { width: 390, height: 844 }, 2));
  try {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({ path: `${dir}/${base}-mobile.png`, fullPage: !modal, clip: modal ? undefined : { x: 0, y: 0, width: 390, height: Math.min(h, 2600) }, animations: 'disabled' });
    await add('mobile', `${base}-mobile.png`);
  } finally { await ctx.close(); }

  return { shots, summary };
}
