/**
 * Các đoạn văn người học dán vào để gõ theo, lưu trên máy (bảng settings, khoá `typingPassages`) kèm tiến độ: số câu đã
 * gõ xong tính từ đầu, để lần sau gõ tiếp. Giữ 12 đoạn mở gần nhất.
 */
import { db, type AppDB } from '../../lib/db';
import { setSetting, SETTING_DEFAULTS } from '../../lib/settings';
import { passageId, tidyPassage } from '../../lib/passage';

export interface SavedPassage {
  id: string;
  text: string;
  /** lần mở gần nhất */
  at: number;
  /** số câu đã gõ xong tính từ đầu */
  done: number;
  /** tổng số câu (0: chưa chia câu) */
  n: number;
}

const KEY = 'typingPassages';
const KEEP = 12;

export async function listPassages(): Promise<SavedPassage[]> {
  return db().then(savedPassagesQuery);
}

/**
 * Query Dexie thuần cho useLiveQuery: đọc thô khoá `typingPassages`. Khởi tạo đồng bộ trên instance
 * nên liveQuery theo dõi được bảng `settings` (không được `await` trước khi chạm DB).
 */
export const savedPassagesQuery = (t: AppDB): Promise<SavedPassage[]> =>
  t.settings.get(KEY).then((row) => {
    const list = (row?.value ?? SETTING_DEFAULTS.typingPassages) as SavedPassage[];
    return Array.isArray(list) ? list.filter((p) => p && typeof p.text === 'string' && typeof p.id === 'string') : [];
  });

async function write(list: SavedPassage[]) {
  await setSetting(KEY, list.slice(0, KEEP));
}

/** Lưu (hoặc mở lại) một đoạn văn: đưa lên đầu danh sách, giữ tiến độ cũ nếu đã có. */
export async function savePassage(raw: string): Promise<SavedPassage> {
  const text = tidyPassage(raw);
  const id = passageId(text);
  const list = await listPassages();
  const old = list.find((p) => p.id === id);
  const p: SavedPassage = { id, text, at: Date.now(), done: old?.done ?? 0, n: old?.n ?? 0 };
  await write([p, ...list.filter((x) => x.id !== id)]);
  return p;
}

export async function getPassage(id: string): Promise<SavedPassage | undefined> {
  return (await listPassages()).find((p) => p.id === id);
}

/** Ghi tiến độ của một đoạn. */
export async function updatePassage(id: string, patch: Partial<Pick<SavedPassage, 'done' | 'n'>>): Promise<void> {
  const list = await listPassages();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch, at: Date.now() };
  await write(list);
}

export async function removePassage(id: string): Promise<void> {
  await write((await listPassages()).filter((p) => p.id !== id));
}
