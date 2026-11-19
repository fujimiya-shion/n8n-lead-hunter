// Icon Lucide nhúng thẳng SVG vào HTML (không phụ thuộc CDN). Tên lạ → dùng icon dự phòng.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const cache = new Map();

export function iconExists(name) {
  return /^[a-z0-9-]+$/.test(name || '') && fs.existsSync(path.join(DIR, `${name}.svg`));
}

export function icon(name, cls = 'h-6 w-6', fallback = 'check') {
  const n = iconExists(name) ? name : fallback;
  if (!cache.has(n)) {
    const raw = fs.readFileSync(path.join(DIR, `${n}.svg`), 'utf8');
    cache.set(n, raw.replace(/<!--[\s\S]*?-->/g, '').trim());
  }
  return cache.get(n)
    .replace(/\swidth="\d+"/, '').replace(/\sheight="\d+"/, '')
    .replace(/class="[^"]*"/, `class="${cls}" aria-hidden="true"`);
}
