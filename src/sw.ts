/// <reference lib="webworker" />
import { CacheFirst, CacheableResponsePlugin, NetworkFirst, Serwist, type PrecacheEntry } from 'serwist';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] };

// Base của site lấy từ scope (ví dụ '/chuhan/').
const BASE = new URL(self.registration.scope).pathname;
const sameOrigin = (url: URL) => url.origin === self.location.origin;
// Bản xem trước PR nằm dưới cùng origin; service worker chính không được đụng vào.
const isPreview = (url: URL) => url.pathname.startsWith(BASE + 'pr-preview/');

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Trang chọn nội dung bằng tham số (tu/?w=, chu/?c=, tra/?q=, hoc/cap/?n=): bỏ qua mọi tham số khi tìm
  // trong precache, để tu/?w=<bất kỳ> vẫn mở được trang tu/ đã lưu khi mất mạng.
  precacheOptions: { ignoreURLParametersMatching: [/.*/] },
  skipWaiting: false, // chờ người học bấm "Cập nhật"
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      // Trang HTML: thử mạng trước (3 giây), mất mạng thì dùng bản đã lưu.
      matcher: ({ request, url }) =>
        request.mode === 'navigate' && sameOrigin(url) && url.pathname.startsWith(BASE) && !isPreview(url),
      handler: new NetworkFirst({
        cacheName: 'trang',
        networkTimeoutSeconds: 3,
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    {
      // Dữ liệu có băm trong tên tệp (hoặc thư mục theo phiên bản): lấy từ cache trước.
      // data/manifest.json không thuộc nhóm này: nó được precache cùng phiên bản app.
      matcher: ({ url }) =>
        sameOrigin(url) && url.pathname.startsWith(BASE + 'data/') && !url.pathname.endsWith('/manifest.json') && !isPreview(url),
      handler: new CacheFirst({
        cacheName: 'du-lieu',
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
  ],
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

serwist.addEventListeners();
