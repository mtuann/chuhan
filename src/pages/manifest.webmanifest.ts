import type { APIRoute } from 'astro';
import { url } from '../lib/url';

// Sinh lúc build để start_url/scope khớp base (bản chính và bản xem trước khác nhau).
export const GET: APIRoute = () => {
  const manifest = {
    name: 'Chữ Hán',
    short_name: 'Chữ Hán',
    description: 'Đọc, viết, gõ chữ Hán cho người Việt: pinyin theo ngữ cảnh, màu thanh điệu, âm Hán Việt, nét chữ.',
    lang: 'vi',
    start_url: url(),
    scope: url(),
    display: 'standalone',
    background_color: '#fcfcfb',
    theme_color: '#fcfcfb',
    icons: [
      { src: url('icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: url('icons/icon-512.png'), sizes: '512x512', type: 'image/png' },
      { src: url('icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
};
