/**
 * Đọc/ghi IndexedDB cho sao lưu dữ liệu (trang /toi/sao-luu/). Trang chỉ nạp module này bằng `await import()` khi
 * người dùng bấm nút.
 *
 * Nhập có hai cách: **gộp** (mặc định) và **thay thế** (xem `importBackup`), ghi mọi bảng trong CÙNG một transaction
 * (lỗi ở bước nào cũng rollback, dữ liệu cũ không bị thay đổi).
 *
 * Nén/giải nén gzip bằng `CompressionStream`/`DecompressionStream` có sẵn của trình duyệt: `exportBackupBlob` nén
 * payload thành Blob `.json.gz`, `readBackupFile` đọc file người dùng chọn (tự nhận diện gzip qua magic bytes).
 */
import { pruneAttempts } from './attempts';
import {
  BACKUP_TABLES,
  buildExportPayload,
  mergeTables,
  summarize,
  type BackupPayload,
  type BackupSummary,
  type BackupTables,
  type MergeStats,
} from './backup';
import { db, dailyFromAttempts, type AppDB } from './db';

async function readTables(t: AppDB): Promise<BackupTables> {
  return {
    words: await t.words.toArray(),
    contexts: await t.contexts.toArray(),
    attempts: await t.attempts.toArray(),
    daily: await t.daily.toArray(),
    bests: await t.bests.toArray(),
    notes: await t.notes.toArray(),
    settings: await t.settings.toArray(),
    errors: await t.errors.toArray(),
  };
}

/** Đọc toàn bộ IndexedDB (trong một transaction chỉ đọc, để các bảng khớp nhau) rồi dựng payload sao lưu. */
export async function exportBackup(): Promise<BackupPayload> {
  const t = await db();
  const tables = await t.transaction('r', t.tables, () => readTables(t));
  return buildExportPayload(tables);
}

/** Tóm tắt dữ liệu đang có trên máy (để so với file trước khi nhập). */
export async function localSummary(): Promise<BackupSummary> {
  const t = await db();
  return t.transaction('r', t.words, t.attempts, t.notes, async () =>
    summarize({ words: await t.words.toArray(), attempts: await t.attempts.toArray(), notes: await t.notes.toArray() }),
  );
}

/** File thiếu tổng hợp theo ngày: dựng lại từ các lượt trong file. */
function withDaily(tables: BackupTables): BackupTables {
  return tables.daily.length || !tables.attempts.length ? tables : { ...tables, daily: dailyFromAttempts(tables.attempts) };
}

export type ImportMode = 'merge' | 'replace';
export interface ImportResult {
  mode: ImportMode;
  /** gộp: số dòng thêm, cập nhật mỗi bảng; thay thế: `added` là số dòng của file */
  stats: MergeStats;
}

/**
 * Nhập payload đã validate.
 * - `merge` (mặc định): gộp vào dữ liệu trên máy theo `mergeTables`, không xoá gì; nhập cùng một file hai lần không
 *   sinh dòng trùng.
 * - `replace`: xoá mọi bảng rồi ghi dữ liệu của file (trang tải một bản sao lưu của máy trước khi gọi).
 */
export async function importBackup(payload: BackupPayload, mode: ImportMode = 'merge'): Promise<ImportResult> {
  const t = await db();
  const file = withDaily(payload.tables);
  let stats = {} as MergeStats;
  await t.transaction('rw', t.tables, async () => {
    if (mode === 'replace') {
      for (const name of BACKUP_TABLES) {
        const table = t.table(name);
        await table.clear();
        const rows = file[name] as unknown[];
        if (rows.length) await table.bulkPut(rows);
        stats[name] = { added: rows.length, updated: 0 };
      }
    } else {
      const merged = mergeTables(await readTables(t), file);
      stats = merged.stats;
      for (const name of BACKUP_TABLES) {
        const rows = merged.put[name] as unknown[];
        if (rows.length) await t.table(name).bulkPut(rows);
      }
      await pruneAttempts(t);
    }
  });
  return { mode, stats };
}

/* ---------- nén / giải nén gzip (CompressionStream của trình duyệt) ---------- */

/** Magic bytes của gzip (RFC 1952): 1f 8b — dùng để nhận diện file .json.gz. */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/**
 * true khi 2 byte đầu là magic bytes gzip. Nhận `Uint8Array`/`number[]` để dễ kiểm thử.
 * Dùng để phân biệt file `.json.gz` với bản `.json` cũ không nén (tương thích ngược).
 */
export function isGzipData(head: ArrayLike<number>): boolean {
  return head.length >= 2 && head[0] === GZIP_MAGIC_0 && head[1] === GZIP_MAGIC_1;
}

/** Trình duyệt có nén được gzip không (`CompressionStream`). */
export function canCompress(): boolean {
  return typeof CompressionStream === 'function';
}

/** Trình duyệt có giải nén được gzip không (`DecompressionStream`). */
export function canDecompress(): boolean {
  return typeof DecompressionStream === 'function';
}

/** Định dạng dung lượng theo tiếng Việt, vd. "2,1 MB", "850 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${units[u]}`;
}

export interface CompressedBackup {
  blob: Blob;
  /** dung lượng JSON gốc (byte), đếm trong lúc mã hoá từng đoạn */
  rawBytes: number;
  /** dung lượng sau khi nén (byte) */
  gzippedBytes: number;
}

/**
 * Nén payload sao lưu thành Blob gzip (đuôi `.json.gz`) để tải xuống.
 *
 * Dùng streaming: JSON được mã hoá UTF-8 và đẩy qua `CompressionStream` theo từng
 * đoạn ~64 KiB, nên không giữ đồng thời cả chuỗi JSON 20 MB lẫn buffer nén 20 MB
 * trong RAM — đỉnh RAM chỉ khoảng chuỗi JSON + vài đoạn đang bay + buffer nén
 * (JSON text nén gzip thường chỉ còn 1/5–1/10).
 *
 * Ném lỗi tiếng Việt khi trình duyệt không hỗ trợ `CompressionStream` (trang gọi
 * `canCompress()` trước để fallback tải JSON thường trong trường hợp này).
 */
export async function exportBackupBlob(payload: BackupPayload): Promise<CompressedBackup> {
  if (!canCompress()) {
    throw new Error(
      'Trình duyệt của bạn không hỗ trợ nén gzip (CompressionStream). ' +
        'Hãy dùng phiên bản Chrome, Edge, Firefox hoặc Safari mới hơn.',
    );
  }
  const json = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const CHUNK_CHARS = 64 * 1024;
  let offset = 0;
  let rawBytes = 0;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= json.length) {
        controller.close();
        return;
      }
      let end = Math.min(offset + CHUNK_CHARS, json.length);
      // không cắt đôi surrogate pair ở biên đoạn (sẽ làm hỏng ký tự khi mã hoá UTF-8)
      if (end < json.length) {
        const last = json.charCodeAt(end - 1);
        if (last >= 0xd800 && last <= 0xdbff) end -= 1;
      }
      const chunk = encoder.encode(json.slice(offset, end));
      rawBytes += chunk.byteLength;
      offset = end;
      controller.enqueue(chunk);
    },
  });
  // Ép kiểu qua unknown: DOM lib mới khai CompressionStream.writable là
  // WritableStream<BufferSource>, không khớp chữ ký pipeThrough (chỉ là vấn đề
  // kiểu, runtime vẫn đúng vì luôn đẩy Uint8Array).
  const cs = new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
  const gzipped = source.pipeThrough(cs);
  const blob = await new Response(gzipped).blob();
  return { blob, rawBytes, gzippedBytes: blob.size };
}

/**
 * Đọc file sao lưu người dùng chọn rồi parse JSON (chưa validate — trang gọi
 * `validateBackup()` sau như cũ).
 *
 * Tự nhận diện gzip qua magic bytes (`1f 8b`) nên vẫn nhập được bản `.json` cũ
 * không nén. Giải nén bằng `DecompressionStream` qua streaming (`file.stream()`),
 * chỉ đọc nội dung file một lần vào RAM. Ném lỗi tiếng Việt khi file bị hỏng
 * hoặc trình duyệt không hỗ trợ giải nén.
 */
export async function readBackupFile(file: File): Promise<unknown> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let text: string;
  if (isGzipData(head)) {
    if (!canDecompress()) {
      throw new Error(
        'Trình duyệt của bạn không hỗ trợ giải nén file .json.gz (DecompressionStream). ' +
          'Hãy dùng phiên bản Chrome, Edge, Firefox hoặc Safari mới hơn, hoặc nhập bản JSON cũ (.json).',
      );
    }
    try {
      const ds = new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>;
      text = await new Response(file.stream().pipeThrough(ds)).text();
    } catch {
      throw new Error('Không giải nén được file này. File có thể đã bị hỏng — hãy thử xuất lại bản sao lưu.');
    }
  } else {
    text = await file.text();
  }
  try {
    return JSON.parse(text);
  } catch {
    // giữ nguyên thông điệp cũ của trang sao-lưu
    throw new Error('File không phải JSON hợp lệ. Hãy chọn đúng file sao lưu đã xuất từ trang này.');
  }
}
