/**
 * Bước emit: ghi tệp vào public/data/ với tên có băm nội dung, chia nhỏ theo ngân sách gzip.
 */
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export const OUT_DIR = 'public/data';
/** Ngân sách mỗi tệp (gzip) theo spec. */
export const MAX_GZIP = 160 * 1024;
export const LICENSE_DIRS = ['sa', 'apl', 'lgpl', 'by', 'mit'] as const;

export const gzipSize = (s: string | Buffer) => gzipSync(s).length;
const hash8 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex').slice(0, 8);

export interface OutFile {
  /** đường dẫn tương đối trong public/data */
  rel: string;
  content: string | Buffer;
}

export class Emitter {
  readonly files: OutFile[] = [];

  /** Ghi JSON có băm: `sa/lv/1-0` → `sa/lv/1-0.<băm>.json`. Trả đường dẫn tương đối. */
  json(stem: string, obj: unknown): string {
    const content = JSON.stringify(obj);
    const rel = `${stem}.${hash8(content)}.json`;
    this.add(rel, content);
    return rel;
  }

  /** Ghi tệp với tên cố định. */
  add(rel: string, content: string | Buffer) {
    const top = rel.split('/')[0];
    if (rel !== 'manifest.json' && !(LICENSE_DIRS as readonly string[]).includes(top)) {
      throw new Error(`Tệp ${rel} không nằm trong thư mục license nào`);
    }
    if (this.files.some((f) => f.rel === rel)) throw new Error(`Trùng tệp ${rel}`);
    this.files.push({ rel, content });
  }

  /** Băm tổng của mọi tệp (trừ manifest). */
  digest(): string {
    const h = createHash('sha256');
    for (const f of [...this.files].sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
      if (f.rel === 'manifest.json') continue;
      h.update(f.rel).update('\0').update(createHash('sha256').update(f.content).digest());
    }
    return h.digest('hex').slice(0, 16);
  }

  async write() {
    await rm(OUT_DIR, { recursive: true, force: true });
    const dirs = new Set(this.files.map((f) => path.dirname(path.join(OUT_DIR, f.rel))));
    for (const d of dirs) await mkdir(d, { recursive: true });
    // ghi song song theo lô để nhanh mà không mở quá nhiều tệp
    const BATCH = 256;
    for (let i = 0; i < this.files.length; i += BATCH) {
      await Promise.all(this.files.slice(i, i + BATCH).map((f) => writeFile(path.join(OUT_DIR, f.rel), f.content)));
    }
  }
}

/**
 * Chia `items` thành các khối liên tiếp có cùng số phần tử `per` sao cho mỗi khối (sau khi `wrap`, chưa nén)
 * ≤ `maxRaw` byte. Dùng kích thước chưa nén để kết quả không phụ thuộc phiên bản zlib (tên tệp, băm ổn định);
 * ngân sách gzip 60 KB được kiểm tra riêng ở bước validate.
 */
export function chunkEven<T>(items: T[], wrap: (chunk: T[], index: number) => unknown, maxRaw: number): { per: number; chunks: T[][] } {
  if (!(maxRaw > 0)) throw new Error('chunkEven: maxRaw phải > 0');
  if (!items.length) return { per: 1, chunks: [[]] };
  const size = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
  let n = Math.max(1, Math.ceil(size(wrap(items, 0)) / maxRaw));
  for (;;) {
    const per = Math.ceil(items.length / n);
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += per) chunks.push(items.slice(i, i + per));
    if (chunks.every((c, i) => size(wrap(c, i)) <= maxRaw)) return { per, chunks };
    if (per === 1) throw new Error(`chunkEven: một phần tử đã vượt ${maxRaw} byte`);
    n++;
  }
}

/** Ngân sách chưa nén theo loại tệp (tỉ lệ nén đo được ~0,25–0,47 → dưới 55 KB gzip). */
export const RAW_BUDGET = { words: 140 * 1024, chars: 150 * 1024, search: 110 * 1024, points: 160 * 1024, lessons: 200 * 1024 } as const;
