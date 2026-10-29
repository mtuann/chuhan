// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Bản chính chạy dưới /chuhan/; bản xem trước PR đặt ASTRO_BASE khác.
const base = process.env.ASTRO_BASE || '/chuhan/';

/**
 * Chèn <link rel="modulepreload"> cho các chunk island của từng trang.
 * Tên chunk có hash theo build nên không hardcode được trong Base.astro:
 * plugin đọc thẻ <astro-island> (component-url / renderer-url) trong HTML
 * đã render rồi chèn link vào <head>. Renderer (client.*.js — React runtime,
 * mọi island React đều cần) được ưu tiên trước, tối đa 4 link/trang.
 * @returns {import('vite').Plugin}
 */
function islandPreload() {
  return {
    name: 'island-preload',
    enforce: 'post',
    transformIndexHtml(html) {
      const urls = [];
      const seen = new Set();
      for (const re of [/renderer-url="([^"]+)"/g, /component-url="([^"]+)"/g]) {
        for (const m of html.matchAll(re)) {
          if (!seen.has(m[1])) {
            seen.add(m[1]);
            urls.push(m[1]);
          }
        }
      }
      const links = urls
        .slice(0, 4)
        .map((u) => `<link rel="modulepreload" href="${u}">`)
        .join('');
      return links ? html.replace('</head>', `${links}</head>`) : html;
    },
  };
}

export default defineConfig({
  site: 'https://mtuann.github.io',
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [react()],
  vite: { plugins: [tailwindcss(), islandPreload()] },
});
