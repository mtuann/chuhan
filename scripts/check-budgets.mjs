// Kiểm tra ngân sách hiệu năng (xem docs/specs/00-nguyen-tac-chung.md §8). Thoát mã 1 nếu vượt.
// JS của mỗi trang = script module + island (renderer-url, component-url) + mọi import tĩnh của chúng, đo sau gzip.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const KB = 1024;
const LIMITS = {
  contentJs: 20 * KB, // trang nội dung (không có ứng dụng React)
  appJs: 170 * KB, // trang có ứng dụng React
  dataFile: 160 * KB, // một tệp dữ liệu (khớp MAX_GZIP trong scripts/data/emit.ts)
  site: 300 * 1024 * KB, // toàn site, không tính audio
};

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const base = (() => {
  const b = process.env.ASTRO_BASE || '/chuhan/';
  return '/' + b.replace(/^\/+|\/+$/g, '') + '/';
})();
/** Đường dẫn URL trong HTML → tệp trong dist. */
function toFile(urlPath) {
  const p = urlPath.split('?')[0];
  const rel = p.startsWith(base) ? p.slice(base.length) : p.replace(/^\//, '');
  return path.join(DIST, decodeURIComponent(rel));
}

const gz = async (file) => gzipSync(await readFile(file)).length;
const sizeCache = new Map();
async function jsClosure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  let src;
  try {
    src = await readFile(file, 'utf8');
  } catch {
    return seen;
  }
  // import tĩnh: import x from"./a.js"; import"./b.js"; export … from"./c.js"
  for (const m of src.matchAll(/(?:import|export)\s*(?:[^'"]*?from\s*)?["'](\.{1,2}\/[^"']+\.js)["']/g)) {
    await jsClosure(path.join(path.dirname(file), m[1]), seen);
  }
  return seen;
}

let failed = false;
const report = [];
const files = await walk(DIST);

for (const html of files.filter((f) => f.endsWith('.html'))) {
  const src = await readFile(html, 'utf8');
  const entries = new Set();
  for (const m of src.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) entries.add(toFile(m[1]));
  for (const m of src.matchAll(/(?:renderer-url|component-url)="([^"]+)"/g)) entries.add(toFile(m[1]));
  const all = new Set();
  for (const e of entries) for (const f of await jsClosure(e)) all.add(f);
  let total = 0;
  for (const f of all) {
    if (!sizeCache.has(f)) sizeCache.set(f, await gz(f).catch(() => 0));
    total += sizeCache.get(f);
  }
  // script inline (không có src)
  for (const m of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) total += gzipSync(m[1]).length;
  const isApp = src.includes('<astro-island');
  const limit = isApp ? LIMITS.appJs : LIMITS.contentJs;
  const ok = total <= limit;
  if (!ok) failed = true;
  report.push(`${ok ? 'ok ' : 'VƯỢT'} ${(total / KB).toFixed(1).padStart(6)} KB / ${limit / KB} KB  ${path.relative(DIST, html)}${isApp ? ' (app)' : ''}`);
}

let site = 0;
const data = { files: 0, bytes: 0, max: { size: 0, file: '' } };
for (const f of files) {
  const s = (await stat(f)).size;
  site += s;
  if (f.startsWith(path.join(DIST, 'data') + path.sep) && f.endsWith('.json')) {
    const g = await gz(f);
    data.files++;
    data.bytes += s;
    if (g > data.max.size) data.max = { size: g, file: path.relative(DIST, f) };
    if (g > LIMITS.dataFile) {
      failed = true;
      report.push(`VƯỢT tệp dữ liệu ${(g / KB).toFixed(1)} KB  ${path.relative(DIST, f)}`);
    }
  }
}
report.push(
  `${data.max.size > LIMITS.dataFile ? 'VƯỢT' : 'ok '} dữ liệu: ${data.files} tệp JSON, ${(data.bytes / 1024 / KB).toFixed(1)} MB; ` +
    `lớn nhất ${(data.max.size / KB).toFixed(1)} KB gzip / ${LIMITS.dataFile / KB} KB (${data.max.file})`,
);
if (site > LIMITS.site) failed = true;
report.push(`${site > LIMITS.site ? 'VƯỢT' : 'ok '} toàn site ${(site / 1024 / KB).toFixed(1)} MB / ${LIMITS.site / 1024 / KB} MB`);

// Kho âm thanh mẫu (giọng đọc dist/data/sa/audio): guardrail riêng, không gộp vào ngân sách toàn site.
const AUDIO_DIR = path.join(DIST, 'data', 'sa', 'audio');
const AUDIO_LIMIT = 50 * 1024 * KB;
let audioBytes = 0;
try {
  for (const f of await walk(AUDIO_DIR)) audioBytes += (await stat(f)).size;
} catch {
  // thư mục audio chưa có (build không kèm audio): coi như 0 byte
}
const audioOk = audioBytes <= AUDIO_LIMIT;
if (!audioOk) failed = true;
report.push(
  `${audioOk ? 'ok ' : 'VƯỢT'} kho audio ${(audioBytes / 1024 / KB).toFixed(1)} MB / ${AUDIO_LIMIT / 1024 / KB} MB  dist/data/sa/audio` +
    (audioOk
      ? ''
      : ' — vượt ngân sách, cần giảm dung lượng tệp âm thanh (audio library over budget: reduce audio file sizes or raise the budget)'),
);

console.log(report.join('\n'));
if (failed) {
  console.error('\nNgân sách hiệu năng bị vượt.');
  process.exit(1);
}
