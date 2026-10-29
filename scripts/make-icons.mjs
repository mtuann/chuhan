// Tạo biểu tượng app từ dữ liệu nét của chữ 字 (hanzi-writer-data, Arphic Public License).
// Chạy tay khi cần đổi biểu tượng: `node scripts/make-icons.mjs` (cần Chromium cho Playwright).
// Kết quả được commit trong public/icons/.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('hanzi-writer-data/package.json'));
const data = JSON.parse(await readFile(path.join(pkgDir, '字.json'), 'utf8'));
const paths = data.strokes.map((d) => `<path d="${d}"/>`).join('');

const BG = '#9a6b12';
const FG = '#ffffff';

/** SVG vuông 1024: nền, lưới 田字格 nét đứt, chữ 字 thu nhỏ theo `scale`. */
function svg({ size, scale, radius, grid }) {
  const s = scale;
  const off = (1024 - 1024 * s) / 2;
  const gridLines = grid
    ? `<g stroke="${FG}" stroke-opacity="0.28" stroke-width="10" stroke-dasharray="36 28">
         <line x1="512" y1="${off}" x2="512" y2="${1024 - off}"/><line x1="${off}" y1="512" x2="${1024 - off}" y2="512"/>
       </g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">
    <rect width="1024" height="1024" rx="${radius}" fill="${BG}"/>
    ${gridLines}
    <g transform="translate(${off} ${off}) scale(${s})"><g transform="scale(1,-1) translate(0,-900)" fill="${FG}">${paths}</g></g>
  </svg>`;
}

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/favicon.svg', svg({ size: 64, scale: 0.86, radius: 200, grid: false }));

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
async function png(file, size, opts) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg({ size, ...opts })}</body></html>`);
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png('icon-192.png', 192, { scale: 0.78, radius: 220, grid: true });
await png('icon-512.png', 512, { scale: 0.78, radius: 220, grid: true });
// Maskable: nền tràn viền, chữ nằm gọn trong vùng an toàn 80%.
await png('icon-maskable-512.png', 512, { scale: 0.62, radius: 0, grid: true });
await png('apple-touch-icon.png', 180, { scale: 0.74, radius: 0, grid: true });
await browser.close();
console.log('[icons] đã tạo public/icons/*');
