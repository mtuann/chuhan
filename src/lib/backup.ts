/**
 * Sao lưu dữ liệu trên máy (trang /toi/sao-luu/).
 *
 * Module NHẸ (không import Dexie): chỉ có hằng số, kiểu, validate và dựng payload. Đọc/ghi IndexedDB nằm ở
 * `./backup-io`, trang nạp LAZY khi người dùng bấm nút.
 *
 * Dữ liệu = toàn bộ IndexedDB `chuhan`: từ đã đánh dấu (`words`) và câu gặp từ (`contexts`), lượt tập viết, gõ
 * (`attempts`) và tổng hợp theo ngày (`daily`), kỷ lục gõ (`bests`), ghi nhớ (`notes`), cài đặt (`settings`), nhật ký
 * lỗi (`errors`).
 *
 * Nhập có hai cách (xem `./backup-io`: `importBackup`):
 * - **Gộp** (mặc định): thêm dữ liệu của file vào máy, không xoá gì. Quy tắc từng bảng ở `mergeTables` (thuần, có test).
 * - **Thay thế**: xoá dữ liệu trên máy rồi ghi dữ liệu của file (trang tự tải một bản sao lưu của máy trước).
 *
 * File: JSON `{ app, version, exportedAt, tables }` nén gzip (`CompressionStream`); nhập nhận cả `.json.gz` lẫn `.json`,
 * validate chặt chẽ TRƯỚC khi ghi (`validateBackup`).
 */
import type { AttemptRow, BestRow, ContextRow, DailyRow, ErrorRow, MyWordRow, NoteRow, SettingRow } from './db';

/** Định danh app trong file sao lưu (phải khớp thì nhập mới chấp nhận). */
export const BACKUP_APP = 'chuhan';
/** Phiên bản schema file sao lưu hiện tại. */
export const BACKUP_VERSION = 1;

/** Mọi bảng được sao lưu, theo thứ tự ghi khi nhập. */
export const BACKUP_TABLES = ['words', 'contexts', 'attempts', 'daily', 'bests', 'notes', 'settings', 'errors'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupTables {
  words: MyWordRow[];
  contexts: ContextRow[];
  attempts: AttemptRow[];
  daily: DailyRow[];
  bests: BestRow[];
  notes: NoteRow[];
  settings: SettingRow[];
  errors: ErrorRow[];
}

export interface BackupPayload {
  app: typeof BACKUP_APP;
  version: number;
  /** lúc xuất (ms, giờ máy người xuất) */
  exportedAt: number;
  tables: BackupTables;
}

/** Lỗi khi file sao lưu không hợp lệ (hiển thị trực tiếp cho người dùng). */
export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

/** Gom toàn bộ dữ liệu trên máy thành một payload (thuần, để kiểm thử được). */
export function buildExportPayload(tables: BackupTables, exportedAt = Date.now()): BackupPayload {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt, tables };
}

/** Tên file tải xuống: chuhan-sao-luu-YYYY-MM-DD.json.gz (ngày theo giờ máy); `gzipped=false` cho bản JSON thường. */
export function backupFilename(at = new Date(), gzipped = true): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `chuhan-sao-luu-${y}-${m}-${d}.${gzipped ? 'json.gz' : 'json'}`;
}

/* ---------- validate ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

const ATTEMPT_KINDS = ['write', 'type'];
const WORD_STATES = ['hoc', 'biet'];

interface RowCtx {
  table: BackupTable;
  i: number;
}
const bad = (c: RowCtx, what: string): never => {
  throw new BackupValidationError(`Bảng "${c.table}", dòng ${c.i + 1}: ${what}.`);
};
const need = (c: RowCtx, ok: boolean, what: string): void => {
  if (!ok) bad(c, what);
};
const needStr = (c: RowCtx, v: unknown, name: string): void => need(c, isStr(v), `"${name}" phải là chuỗi`);
const needNum = (c: RowCtx, v: unknown, name: string): void => need(c, isNum(v), `"${name}" phải là số`);
const needIn = (c: RowCtx, v: unknown, list: readonly unknown[], name: string): void => need(c, list.includes(v), `"${name}" không hợp lệ`);

const ROW_VALIDATORS: Record<BackupTable, (r: Record<string, unknown>, c: RowCtx) => void> = {
  words: (r, c) => {
    needStr(c, r.itemId, 'itemId');
    needIn(c, r.st, WORD_STATES, 'st');
    needNum(c, r.at, 'at');
    needStr(c, r.src, 'src');
    needStr(c, r.s, 's');
    needStr(c, r.p, 'p');
  },
  contexts: (r, c) => {
    needStr(c, r.itemId, 'itemId');
    need(c, isArr(r.tk), '"tk" phải là mảng');
    needStr(c, r.src, 'src');
    needNum(c, r.at, 'at');
  },
  attempts: (r, c) => {
    needStr(c, r.id, 'id');
    needIn(c, r.kind, ATTEMPT_KINDS, 'kind');
    needNum(c, r.at, 'at');
    need(c, isBool(r.ok), '"ok" phải là true/false');
  },
  daily: (r, c) => {
    need(c, isStr(r.day) && /^\d{4}-\d{2}-\d{2}$/.test(r.day), '"day" phải có dạng YYYY-MM-DD');
    needNum(c, r.ms, 'ms');
    needNum(c, r.typeRounds, 'typeRounds');
    needNum(c, r.typeChars, 'typeChars');
  },
  bests: (r, c) => {
    needStr(c, r.id, 'id');
    needStr(c, r.mode, 'mode');
    needNum(c, r.level, 'level');
    needNum(c, r.cpm, 'cpm');
    needNum(c, r.at, 'at');
  },
  notes: (r, c) => {
    needStr(c, r.itemId, 'itemId');
    needStr(c, r.text, 'text');
    needNum(c, r.updatedAt, 'updatedAt');
  },
  settings: (r, c) => {
    need(c, isStr(r.key) && r.key.length > 0, '"key" phải là chuỗi khác rỗng');
    need(c, r.value !== undefined, '"value" bị thiếu');
  },
  errors: (r, c) => {
    needNum(c, r.at, 'at');
    needStr(c, r.kind, 'kind');
    needStr(c, r.message, 'message');
  },
};

/** Kiểm tra một đối tượng đã parse từ JSON có phải bản sao lưu hợp lệ không; ném `BackupValidationError` nếu không. */
export function validateBackup(raw: unknown): BackupPayload {
  if (!isObj(raw)) throw new BackupValidationError('File không phải một đối tượng JSON hợp lệ.');
  if (raw.app !== BACKUP_APP) throw new BackupValidationError(`File này không phải bản sao lưu của Chữ Hán (app: ${JSON.stringify(raw.app) ?? 'thiếu'}).`);
  if (!isNum(raw.version) || !Number.isInteger(raw.version)) throw new BackupValidationError('Trường "version" bị thiếu hoặc không hợp lệ.');
  if (raw.version > BACKUP_VERSION)
    throw new BackupValidationError(`Bản sao lưu được tạo bởi phiên bản app mới hơn (version ${raw.version}); hãy cập nhật app rồi thử lại.`);
  if (raw.version < BACKUP_VERSION) throw new BackupValidationError(`Không hỗ trợ bản sao lưu version ${raw.version} (quá cũ).`);
  if (!isNum(raw.exportedAt)) throw new BackupValidationError('Trường "exportedAt" bị thiếu hoặc không hợp lệ.');
  if (!isObj(raw.tables)) throw new BackupValidationError('File thiếu phần "tables" chứa dữ liệu.');
  const tables = raw.tables;
  for (const name of BACKUP_TABLES) {
    const rows = tables[name];
    if (!isArr(rows)) throw new BackupValidationError(`File thiếu hoặc sai định dạng bảng "${name}".`);
    rows.forEach((row, i) => {
      if (!isObj(row)) bad({ table: name, i }, 'dòng không phải đối tượng');
      ROW_VALIDATORS[name](row as Record<string, unknown>, { table: name, i });
    });
  }
  return raw as unknown as BackupPayload;
}

/* ---------- gộp ---------- */

/** Số dòng thêm mới và số dòng cập nhật mỗi bảng sau khi gộp. */
export type MergeStats = Record<BackupTable, { added: number; updated: number }>;

/** Dữ liệu cần ghi sau khi gộp: các dòng cần `bulkPut` cho từng bảng (không xoá dòng nào). */
export interface MergeResult {
  put: { [K in BackupTable]: BackupTables[K] };
  stats: MergeStats;
}

/**
 * Gộp dữ liệu file vào dữ liệu trên máy (thuần). Không xoá gì trên máy; chỉ trả về các dòng cần ghi.
 *
 * - `attempts`: thêm lượt chưa có (theo id).
 * - `words`, `contexts`: bản đánh dấu sau cùng (`at`); `notes`: bản sửa sau cùng (`updatedAt`).
 * - `bests`: tốc độ cao hơn. `daily`: số lớn hơn của từng trường mỗi ngày (không bao giờ tính thừa).
 * - `settings`: giữ cài đặt của máy này, chỉ thêm khoá máy chưa có. `errors` (nhật ký lỗi) không nhập.
 */
export function mergeTables(local: BackupTables, file: BackupTables): MergeResult {
  const put = Object.fromEntries(BACKUP_TABLES.map((n) => [n, []])) as unknown as MergeResult['put'];
  const stats = Object.fromEntries(BACKUP_TABLES.map((n) => [n, { added: 0, updated: 0 }])) as MergeStats;

  function by<K extends BackupTable>(
    name: K,
    key: (r: BackupTables[K][number]) => string,
    pick?: (mine: BackupTables[K][number], theirs: BackupTables[K][number]) => BackupTables[K][number] | null,
  ) {
    const mine = new Map((local[name] as BackupTables[K][number][]).map((r) => [key(r), r]));
    const out = put[name] as BackupTables[K][number][];
    for (const r of file[name] as BackupTables[K][number][]) {
      const cur = mine.get(key(r));
      if (!cur) {
        out.push(r);
        mine.set(key(r), r);
        stats[name].added++;
      } else if (pick) {
        const next = pick(cur, r);
        if (next && JSON.stringify(next) !== JSON.stringify(cur)) {
          out.push(next);
          mine.set(key(r), next);
          stats[name].updated++;
        }
      }
    }
  }
  const newer = <T,>(f: (r: T) => number) => (a: T, b: T) => (f(b) > f(a) ? b : null);

  by('attempts', (r) => r.id);
  by('words', (r) => r.itemId, newer((r) => r.at));
  by('contexts', (r) => r.itemId, newer((r) => r.at));
  by('notes', (r) => r.itemId, newer((r) => r.updatedAt));
  by('bests', (r) => r.id, (a, b) => (b.cpm > a.cpm ? b : null));
  by('daily', (r) => r.day, (a, b) => ({
    day: a.day,
    ms: Math.max(a.ms, b.ms),
    typeRounds: Math.max(a.typeRounds, b.typeRounds),
    typeChars: Math.max(a.typeChars, b.typeChars),
  }));
  by('settings', (r) => r.key);
  return { put, stats };
}

/** Tóm tắt để so sánh dữ liệu trên máy với file trước khi nhập. */
export interface BackupSummary {
  /** từ đã đánh dấu */
  words: number;
  /** chữ đã tập viết */
  chars: number;
  /** lượt gõ */
  typing: number;
  notes: number;
  /** lần đánh dấu hoặc luyện gần nhất (ms), 0 nếu chưa có */
  lastAt: number;
}

export function summarize(t: Pick<BackupTables, 'words' | 'attempts' | 'notes'>): BackupSummary {
  const chars = new Set(t.attempts.filter((a) => a.kind === 'write').map((a) => a.itemId)).size;
  const lastAt = Math.max(0, ...t.words.map((w) => w.at), ...t.attempts.map((a) => a.at));
  return { words: t.words.length, chars, typing: t.attempts.filter((a) => a.kind === 'type').length, notes: t.notes.length, lastAt };
}
