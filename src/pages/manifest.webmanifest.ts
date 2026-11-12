import type { APIRoute } from 'astro';
import { url } from '../lib/url';

// Sinh lúc build để start_url/scope khớp base (bản chính và bản xem trước khác nhau).
export const GET: APIRoute = () => {
  const manifest = {
    id: url(),
    name: 'Chữ Hán',
    short_name: 'Chữ Hán',
    description: 'Đọc, viết, gõ chữ Hán cho người Việt: pinyin theo ngữ cảnh, màu thanh điệu, âm Hán Việt, nét chữ.',
    lang: 'vi',
    start_url: url(),
    scope: url(),
    display: 'standalone',
    background_color: '#fcfcfb',
    theme_color: '#fcfcfb',
    categories: ['education', 'books'],
    // giữ lâu biểu tượng app (Android, Windows) để vào thẳng một mục
    shortcuts: [
      { name: 'Đọc', short_name: 'Đọc', description: 'Dán một đoạn tiếng Trung để đọc', url: url() },
      { name: 'Tập viết', short_name: 'Viết', description: 'Tập viết chữ Hán theo cấp HSK', url: url('viet/') },
      { name: 'Gõ chữ', short_name: 'Gõ', description: 'Luyện gõ pinyin', url: url('go/') },
      { name: 'Tra từ', short_name: 'Tra', description: 'Tra chữ Hán, pinyin, Hán Việt', url: url('tra/') },
    ],
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
