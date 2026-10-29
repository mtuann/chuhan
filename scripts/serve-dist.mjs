// Máy chủ tĩnh tối giản mô phỏng GitHub Pages: phục vụ dist/ dưới base, trả 404.html khi không có tệp.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4321);
const BASE = '/' + (process.env.ASTRO_BASE || '/chuhan/').replace(/^\/+|\/+$/g, '') + '/';
// DIST_DIR: phục vụ một bản build khác (test cập nhật app dùng bản sao của dist/)
const ROOT = path.resolve(process.env.DIST_DIR || 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveFile(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  let rel = decodeURIComponent(urlPath.slice(BASE.length));
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return null;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://x').pathname;
  if (urlPath === BASE.slice(0, -1)) {
    res.writeHead(301, { Location: BASE }).end();
    return;
  }
  const file = await resolveFile(urlPath);
  if (file) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
    return;
  }
  const notFound = path.join(ROOT, '404.html');
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  res.end(await readFile(notFound).catch(() => 'Not found'));
}).listen(PORT, '127.0.0.1', () => console.log(`dist tại http://127.0.0.1:${PORT}${BASE}`));
