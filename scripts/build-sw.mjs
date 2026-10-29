// Chạy sau `astro build`: đóng gói src/sw.ts rồi chèn danh sách precache (Serwist injectManifest).
// Bỏ qua khi PUBLIC_SW=off (bản xem trước PR).
import { build } from 'esbuild';
import { injectManifest } from '@serwist/build';
import { readFile, rm } from 'node:fs/promises';

if (process.env.PUBLIC_SW === 'off') {
  console.log('[sw] PUBLIC_SW=off: bỏ qua service worker');
  process.exit(0);
}

const tmp = 'dist/sw.src.js';
await build({
  entryPoints: ['src/sw.ts'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  outfile: tmp,
  logLevel: 'warning',
});

const { count, size, warnings } = await injectManifest({
  swSrc: tmp,
  swDest: 'dist/sw.js',
  globDirectory: 'dist',
  // data/manifest.json đi cùng phiên bản app; các tệp dữ liệu khác tải khi cần (CacheFirst trong sw.ts).
  globPatterns: ['**/*.{html,js,css,woff,woff2,png,svg,webmanifest}', 'data/manifest.json'],
  // Lưu ý: không dùng 'data/*/**' vì mẫu đó khớp cả data/manifest.json.
  globIgnores: ['sw.js', 'sw.src.js', 'data/{sa,apl,lgpl,mit,by}/**', 'pr-preview/**', '404.html'],
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  dontCacheBustURLsMatching: /^_astro\//,
});
await rm(tmp);
if (!(await readFile('dist/sw.js', 'utf8')).includes('"data/manifest.json"')) {
  console.error('[sw] data/manifest.json không có trong precache (chạy npm run data trước khi build)');
  process.exit(1);
}

for (const w of warnings) console.warn('[sw]', w);
const mb = (size / 1024 / 1024).toFixed(2);
console.log(`[sw] precache ${count} tệp, ${mb} MB`);
if (size > 3 * 1024 * 1024) {
  console.error('[sw] Vượt ngân sách precache 3 MB');
  process.exit(1);
}
