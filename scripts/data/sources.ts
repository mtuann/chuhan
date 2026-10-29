/**
 * Bước fetch: tải các nguồn đã ghim trong sources.lock.json, kiểm sha256, lưu cache ở .cache/sources/.
 * - Mặc định: thiếu cache thì tải; sai sha256 thì dừng.
 * - `--update-lock`: tải lại và ghi sha256 mới vào lock (dùng khi đổi commit).
 * - `--offline`: chỉ dùng cache.
 * - Bản lưu trong repo (`vendor/sources/<id>/<commit 12 ký tự>/<tệp>.gz`): dùng trước khi tải, cho các nguồn mà repo gốc
 *   đã bị xoá hoặc đổi thành riêng tư (CVDICT, hanviet-pinyin-wordlist của ph0ngp: raw.githubusercontent trả 404 từ 10/2026).
 *   Vẫn kiểm sha256 theo lock như tệp tải về.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export interface LockFileEntry {
  path: string;
  sha256: string;
  bytes?: number;
}
export interface Source {
  id: string;
  title: string;
  author: string;
  homepage: string;
  license: string;
  use: string;
  repo?: string;
  commit?: string;
  npm?: string;
  version?: string;
  files: Record<string, LockFileEntry>;
}
export interface Lock {
  $comment?: string;
  version: 1;
  sources: Source[];
}

export const LOCK_PATH = 'sources.lock.json';
export const CACHE_DIR = '.cache/sources';
export const VENDOR_DIR = 'vendor/sources';

export async function readLock(): Promise<Lock> {
  return JSON.parse(await readFile(LOCK_PATH, 'utf8')) as Lock;
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function rawUrl(src: Source, file: string): string {
  if (!src.repo || !src.commit) throw new Error(`Nguồn ${src.id} không phải repo GitHub`);
  const p = file.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${p}`;
}

function cachePath(src: Source, file: string): string {
  return path.join(CACHE_DIR, src.id, (src.commit ?? src.version ?? 'x').slice(0, 12), file);
}

/** Bản lưu trong repo (nén gzip), nếu có. */
export function vendorPath(src: Source, file: string): string {
  return path.join(VENDOR_DIR, src.id, (src.commit ?? src.version ?? 'x').slice(0, 12), file + '.gz');
}

async function download(url: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw new Error(`Không tải được ${url}: ${String(lastErr)}`);
}

/** Đường dẫn cục bộ của từng tệp: files[sourceId][fileKey]. */
export type FetchedFiles = Record<string, Record<string, string>>;

export async function fetchSources(opts: { updateLock?: boolean; offline?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const lock = await readLock();
  const out: FetchedFiles = {};
  let changed = false;
  const tasks: Promise<void>[] = [];
  for (const src of lock.sources) {
    out[src.id] = {};
    if (src.npm) {
      const require = createRequire(path.resolve('package.json'));
      const pkgJson = require.resolve(`${src.npm}/package.json`);
      const pkg = JSON.parse(await readFile(pkgJson, 'utf8')) as { version: string };
      if (pkg.version !== src.version) {
        throw new Error(`${src.npm}: lock ghi ${src.version} nhưng node_modules có ${pkg.version}`);
      }
      out[src.id].dir = path.dirname(pkgJson);
      continue;
    }
    for (const [key, entry] of Object.entries(src.files)) {
      const local = cachePath(src, entry.path);
      out[src.id][key] = local;
      tasks.push(
        (async () => {
          if (!opts.updateLock && existsSync(local)) {
            const buf = await readFile(local);
            if (sha256(buf) === entry.sha256) return;
            log(`[fetch] cache sai sha256, tải lại ${src.id}/${entry.path}`);
          }
          const vendored = vendorPath(src, entry.path);
          const fromVendor = !opts.updateLock && existsSync(vendored);
          if (opts.offline && !fromVendor) throw new Error(`Thiếu cache cho ${src.id}/${entry.path} (đang ở chế độ --offline)`);
          const buf = fromVendor ? gunzipSync(await readFile(vendored)) : await download(rawUrl(src, entry.path));
          const hash = sha256(buf);
          if (opts.updateLock) {
            if (entry.sha256 !== hash || entry.bytes !== buf.length) changed = true;
            entry.sha256 = hash;
            entry.bytes = buf.length;
          } else if (hash !== entry.sha256) {
            throw new Error(
              `sha256 của ${src.id}/${entry.path} không khớp lock (${hash.slice(0, 12)}… ≠ ${entry.sha256.slice(0, 12)}…). ` +
                'Nếu cố ý đổi nguồn, chạy `npm run data -- --update-lock`.',
            );
          }
          await mkdir(path.dirname(local), { recursive: true });
          await writeFile(local + '.part', buf);
          await rename(local + '.part', local);
          log(`[fetch] ${src.id}/${entry.path} (${(buf.length / 1024).toFixed(0)} KB${fromVendor ? ', bản lưu trong repo' : ''})`);
        })(),
      );
    }
  }
  await Promise.all(tasks);
  if (opts.updateLock && changed) {
    await writeFile(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
    log('[fetch] đã cập nhật sha256 trong sources.lock.json');
  }
  return { lock, files: out };
}
