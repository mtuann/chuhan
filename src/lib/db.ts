/**
 * Cơ sở dữ liệu trên máy (IndexedDB qua Dexie), tên `chuhan`. Mọi site dưới mtuann.github.io dùng chung origin, nên
 * tên DB và mọi khoá lưu trữ của app đều có tiền tố riêng.
 *
 * Dexie được NẠP LƯỜI: `await import('dexie')` chỉ chạy ở lần chạm DB đầu tiên (`db()`), nên trang không chạm DB không
 * tải Dexie vào bundle ban đầu.
 */
import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Token } from '../schema/data';
import { studyDayKey } from './day';

export { studyDayKey };

/** Ghi nhớ riêng của người học cho một chữ (`好`) hoặc một từ (`爱好_ai4hao4`). */
export interface NoteRow {
  itemId: string;
  text: string;
  updatedAt: number;
}
export interface SettingRow {
  key: string;
  value: unknown;
}
/** Lượt luyện: tập viết (`write`: itemId là chữ, data.grade), gõ (`type`: itemId là chế độ). */
export interface AttemptRow {
  id: string;
  kind: 'write' | 'type';
  at: number;
  itemId?: string;
  ok: boolean;
  durMs?: number;
  data?: Record<string, unknown>;
}
/** Trạng thái một từ với người học: `hoc` đang học (đánh dấu để để ý), `biet` đã biết (ẩn pinyin khi đọc). */
export type WordState = 'hoc' | 'biet';
/** Một từ người học đã đánh dấu. Lưu kèm phần hiện (chữ, pinyin, Hán Việt, nghĩa) để hiện danh sách không cần tải gói từ. */
export interface MyWordRow {
  /** id từ (爱好_ai4hao4) */
  itemId: string;
  st: WordState;
  /** lúc đánh dấu (đổi trạng thái thì cập nhật) */
  at: number;
  /** cấp HSK 2025; không có: ngoài HSK 2025 */
  lv?: number;
  /** nơi đánh dấu: `doc`, `tra`, `chu`… */
  src: string;
  s: string;
  p: string;
  hv?: string;
  vi?: string;
}
/** Câu người học gặp một từ khi đọc (lưu lúc đánh dấu từ): hiện lại ở danh sách Từ của tôi. */
export interface ContextRow {
  itemId: string;
  /** câu dạng token: [chữ] | [chữ, pinyin] | [chữ, pinyin, id từ] */
  tk: Token[];
  src: string;
  at: number;
}
export interface ErrorRow {
  id?: number;
  at: number;
  kind: string;
  message: string;
  extra?: unknown;
}
/** Kỷ lục gõ thử thách (mỗi cấp một dòng, id `toc-do-<cấp>`), tách khỏi `attempts` để không mất khi bảng bị cắt. */
export interface BestRow {
  id: string;
  mode: string;
  level: number;
  cpm: number;
  chars: number;
  words: number;
  at: number;
}
/** Tổng hợp theo ngày của bảng `attempts` (ghi cùng lúc với lượt), không bị cắt như `attempts`. */
export interface DailyRow {
  /** ngày (YYYY-MM-DD, bắt đầu lúc 04:00) */
  day: string;
  /** thời gian luyện (ms), mỗi lượt tính tối đa 5 phút */
  ms: number;
  /** số lượt gõ */
  typeRounds: number;
  /** số chữ gõ đúng (thử thách tốc độ: số chữ gõ được) */
  typeChars: number;
}

/** Phần đóng góp của một lượt vào tổng hợp ngày (thuần). */
export const ATTEMPT_MAX_MS = 5 * 60_000;
export function attemptContribution(r: Pick<AttemptRow, 'kind' | 'at' | 'durMs' | 'data'>): DailyRow {
  const d = (r.data ?? {}) as { mode?: unknown; right?: unknown; chars?: unknown };
  const typeChars = r.kind !== 'type' ? 0 : d.mode === 'toc-do' ? (typeof d.chars === 'number' ? d.chars : 0) : typeof d.right === 'number' ? d.right : 0;
  return {
    day: studyDayKey(r.at),
    ms: r.durMs && r.durMs > 0 ? Math.min(r.durMs, ATTEMPT_MAX_MS) : 0,
    typeRounds: r.kind === 'type' ? 1 : 0,
    typeChars,
  };
}

/** Cộng (sign = 1) hoặc trừ (sign = -1) một phần đóng góp vào các dòng ngày (Map theo ngày, thuần). */
export function addContribution(days: Map<string, DailyRow>, c: DailyRow, sign: 1 | -1 = 1): void {
  const cur = days.get(c.day) ?? { day: c.day, ms: 0, typeRounds: 0, typeChars: 0 };
  days.set(c.day, {
    day: c.day,
    ms: Math.max(0, cur.ms + sign * c.ms),
    typeRounds: Math.max(0, cur.typeRounds + sign * c.typeRounds),
    typeChars: Math.max(0, cur.typeChars + sign * c.typeChars),
  });
}

/** Tổng hợp theo ngày từ một danh sách lượt (file sao lưu thiếu bảng `daily`). */
export function dailyFromAttempts(rows: readonly Pick<AttemptRow, 'kind' | 'at' | 'durMs' | 'data'>[]): DailyRow[] {
  const days = new Map<string, DailyRow>();
  for (const r of rows) addContribution(days, attemptContribution(r));
  return [...days.values()];
}

/** Dexie instance với các bảng của app (interface, không phải class, để không cần import tĩnh Dexie). */
export interface AppDB extends Dexie {
  words: Table<MyWordRow, string>;
  contexts: Table<ContextRow, string>;
  attempts: Table<AttemptRow, string>;
  daily: Table<DailyRow, string>;
  bests: Table<BestRow, string>;
  notes: Table<NoteRow, string>;
  settings: Table<SettingRow, string>;
  errors: Table<ErrorRow, number>;
}

export const DB_NAME = 'chuhan';
let dbName = DB_NAME;
let appDBClass: (new (name?: string) => AppDB) | null = null;
let instP: Promise<AppDB> | null = null;

async function loadAppDBClass(): Promise<new (name?: string) => AppDB> {
  if (!appDBClass) {
    const { default: DexieImpl } = await import('dexie');
    class Impl extends DexieImpl {
      words!: Table<MyWordRow, string>;
      contexts!: Table<ContextRow, string>;
      attempts!: Table<AttemptRow, string>;
      daily!: Table<DailyRow, string>;
      bests!: Table<BestRow, string>;
      notes!: Table<NoteRow, string>;
      settings!: Table<SettingRow, string>;
      errors!: Table<ErrorRow, number>;

      constructor(name = DB_NAME) {
        super(name);
        this.version(1).stores({
          words: 'itemId, st, at',
          contexts: 'itemId, at',
          attempts: 'id, kind, at',
          daily: 'day',
          bests: 'id',
          notes: 'itemId',
          settings: 'key',
          errors: '++id, at',
        });
      }
    }
    appDBClass = Impl as unknown as new (name?: string) => AppDB;
  }
  return appDBClass;
}

/** Promise tới instance DB duy nhất của app (lần đầu nạp Dexie rồi mới dựng instance). */
export function db(): Promise<AppDB> {
  instP ??= (async () => new (await loadAppDBClass())(dbName))();
  // Nạp Dexie hỏng (lỗi mạng khi tải chunk): bỏ promise hỏng để lần sau thử lại.
  instP.catch(() => {
    instP = null;
  });
  return instP;
}

/** Mở cơ sở dữ liệu khác (test). Đóng instance cũ rồi đặt lại tên. */
export async function openDb(name: string): Promise<void> {
  const old = instP;
  instP = null;
  dbName = name;
  if (old) (await old).close();
}

export async function getNote(itemId: string): Promise<string> {
  return (await (await db()).notes.get(itemId))?.text ?? '';
}

export async function setNote(itemId: string, text: string): Promise<void> {
  const t = await db();
  if (text.trim()) await t.notes.put({ itemId, text, updatedAt: Date.now() });
  else await t.notes.delete(itemId);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await (await db()).settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await db()).settings.put({ key, value });
}

/** Ghi nhật ký lỗi, giữ 50 dòng gần nhất. Không bao giờ ném lỗi. */
export async function logError(kind: string, message: string, extra?: unknown): Promise<void> {
  try {
    const t = (await db()).errors;
    await t.add({ at: Date.now(), kind, message, extra });
    const n = await t.count();
    if (n > 50) {
      const old = await t.orderBy('id').limit(n - 50).primaryKeys();
      await t.bulkDelete(old);
    }
  } catch {
    // nhật ký lỗi hỏng thì bỏ qua
  }
}

/** Lưu câu gặp từ khi đọc (ghi đè câu cũ của cùng từ). */
export async function saveContext(itemId: string, tk: Token[], src: string): Promise<void> {
  await (await db()).contexts.put({ itemId, tk, src, at: Date.now() });
}
