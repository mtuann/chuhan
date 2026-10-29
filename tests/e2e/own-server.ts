// Máy chủ tĩnh riêng cho từng test e2e: phục vụ dist/ (hoặc thư mục chỉ định)
// dưới base /chuhan/, để test có thể tắt/mở máy chủ giữa chừng
// (mô phỏng mất mạng, bản cũ/mới khi cập nhật app).
// Logic phục vụ file giống scripts/serve-dist.mjs.
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const BASE = '/chuhan/';
const TYPES: Record<string, string> = {
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

export interface OwnServer {
  /** Base URL, vd. http://127.0.0.1:4500/chuhan/ */
  base: string;
  stop: () => Promise<void>;
}

async function resolveFile(root: string, urlPath: string): Promise<string | null> {
  if (!urlPath.startsWith(BASE)) return null;
  const rel = decodeURIComponent(urlPath.slice(BASE.length));
  const cand = path.join(root, rel);
  if (!cand.startsWith(root)) return null;
  try {
    const s = await stat(cand);
    const file = s.isDirectory() ? path.join(cand, 'index.html') : cand;
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

export async function startOwnServer(port: number, opts?: { dir?: string }): Promise<OwnServer> {
  const root = path.resolve(opts?.dir ?? 'dist');
  let server: Server;
  await new Promise<void>((resolve) => {
    server = createServer(async (req, res) => {
      const urlPath = new URL(req.url ?? '/', 'http://x').pathname;
      if (urlPath === BASE.slice(0, -1)) {
        res.writeHead(301, { Location: BASE }).end();
        return;
      }
      const file = await resolveFile(root, urlPath);
      if (file) {
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
        res.end(await readFile(file));
        return;
      }
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      res.end(await readFile(path.join(root, '404.html')).catch(() => 'Not found'));
    }).listen(port, '127.0.0.1', resolve);
  });
  return {
    base: `http://127.0.0.1:${port}${BASE}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        // gọi lại được (test tắt máy chủ giữa chừng rồi `finally` tắt lần nữa)
        if (!server!.listening) return resolve();
        server!.closeAllConnections();
        server!.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
