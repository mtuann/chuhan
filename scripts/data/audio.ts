/**
 * Âm thanh người thật từ audio-cmn (Hugo Lopez; CC BY-SA): âm tiết có thanh giọng Chen Wang,
 * từ và chữ HSK 2000 giọng Yue Tan (Shtooka). Repo không có danh sách tệp, nên thử từng tên:
 * âm tiết theo bảng âm tiết × 4 thanh, từ theo danh sách HSK cấp 1–3. Có/không đều lưu cache.
 * Ghim theo commit; lock ghi số tệp và băm tổng của từng nhóm để phát hiện cache hỏng.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, LOCK_PATH, readLock, sha256, type Source } from './sources.ts';

export interface AudioSetLock {
  /** thư mục trong repo audio-cmn */
  dir: string;
  count: number;
  /** sha256 của danh sách "khoá:sha256 tệp" đã sắp xếp */
  digest: string;
}
export type AudioSource = Source & { audio: { syllables: AudioSetLock; words: AudioSetLock } };

interface Probe {
  found: string[];
  missing: string[];
}

const CONCURRENCY = 8;
const ATTEMPTS = 8;

/** Thời gian chờ trước lần thử lại: theo Retry-After nếu máy chủ báo (bị giới hạn tốc độ), không thì tăng dần, tối đa 60 giây. */
function backoffMs(attempt: number, retryAfter: string | null): number {
  const sec = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(sec) && sec >= 0) return Math.min(60_000, sec * 1000 + 250);
  return Math.min(60_000, 500 * 2 ** attempt);
}

async function get(url: string): Promise<Buffer | null> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let retryAfter: string | null = null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) return null;
      if (!res.ok) {
        // 429 / 403: GitHub giới hạn tốc độ request không đăng nhập (CI chạy lần đầu, chưa có cache)
        retryAfter = res.headers.get('retry-after');
        throw new Error(`HTTP ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, backoffMs(attempt, retryAfter)));
    }
  }
  throw new Error(`Không tải được ${url}: ${String(lastErr)}`);
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

/**
 * Tải (hoặc lấy từ cache) một nhóm tệp `<dir>/cmn-<khoá>.mp3`.
 * Trả về map khoá → nội dung của các tệp có thật.
 */
async function fetchSet(
  src: AudioSource,
  set: AudioSetLock,
  keys: string[],
  opts: { offline?: boolean; updateLock?: boolean; log: (m: string) => void },
): Promise<{ files: Map<string, Buffer>; lock: AudioSetLock }> {
  const base = path.join(CACHE_DIR, src.id, src.commit!.slice(0, 12), set.dir);
  const probePath = path.join(base, '_probe.json');
  const probe: Probe = existsSync(probePath) ? JSON.parse(await readFile(probePath, 'utf8')) : { found: [], missing: [] };
  const known = new Set([...probe.found, ...probe.missing]);
  const todo = keys.filter((k) => !known.has(k));
  if (todo.length && opts.offline) throw new Error(`Thiếu cache audio-cmn/${set.dir} cho ${todo.length} tệp (đang ở chế độ --offline)`);
  if (todo.length) {
    opts.log(`[fetch] audio-cmn/${set.dir}: thử ${todo.length} tệp…`);
    await mkdir(base, { recursive: true });
    await pool(todo, CONCURRENCY, async (k) => {
      const rel = `${set.dir}/cmn-${k}.mp3`;
      const url = `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${rel.split('/').map(encodeURIComponent).join('/')}`;
      const buf = await get(url);
      if (!buf) {
        probe.missing.push(k);
        return;
      }
      const local = path.join(base, `cmn-${k}.mp3`);
      await writeFile(local + '.part', buf);
      await rename(local + '.part', local);
      probe.found.push(k);
    });
    probe.found.sort();
    probe.missing.sort();
    await writeFile(probePath, JSON.stringify(probe));
  }
  const want = new Set(keys);
  const files = new Map<string, Buffer>();
  for (const k of probe.found) if (want.has(k)) files.set(k, await readFile(path.join(base, `cmn-${k}.mp3`)));
  const lines = [...files.entries()].map(([k, b]) => `${k}:${sha256(b)}`).sort();
  const lock: AudioSetLock = { dir: set.dir, count: files.size, digest: sha256(lines.join('\n')) };
  if (!opts.updateLock && (lock.count !== set.count || lock.digest !== set.digest)) {
    throw new Error(
      `audio-cmn/${set.dir}: ${lock.count} tệp, băm ${lock.digest.slice(0, 12)}… khác lock (${set.count} tệp, ${set.digest.slice(0, 12)}…). ` +
        'Nếu cố ý đổi nguồn hoặc danh sách từ, chạy `npm run data -- --update-lock`.',
    );
  }
  return { files, lock };
}

export async function fetchAudio(
  src: AudioSource,
  keys: { syllables: string[]; words: string[] },
  opts: { offline?: boolean; updateLock?: boolean; log: (m: string) => void },
): Promise<{ syllables: Map<string, Buffer>; words: Map<string, Buffer> }> {
  const s = await fetchSet(src, src.audio.syllables, keys.syllables, opts);
  const w = await fetchSet(src, src.audio.words, keys.words, opts);
  if (opts.updateLock) {
    const lock = await readLock();
    const entry = lock.sources.find((x) => x.id === src.id) as AudioSource | undefined;
    if (entry && JSON.stringify(entry.audio) !== JSON.stringify({ syllables: s.lock, words: w.lock })) {
      entry.audio = { syllables: s.lock, words: w.lock };
      await writeFile(LOCK_PATH, JSON.stringify(lock, null, 2) + '\n');
      opts.log(`[fetch] đã cập nhật audio-cmn trong ${LOCK_PATH}: ${s.lock.count} âm tiết, ${w.lock.count} từ/chữ`);
    }
  }
  return { syllables: s.files, words: w.files };
}
