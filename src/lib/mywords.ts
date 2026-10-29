/**
 * Từ của tôi (bảng `words`): từ người học đánh dấu "đang học" hoặc "đã biết" khi đọc, tra từ, xem trang chữ.
 * "Đã biết" cùng với "cấp đã biết" (cài đặt `knownLevel`: đã biết mọi từ HSK 1…N) quyết định từ nào được coi là đã biết
 * khi đọc (ẩn pinyin ở chế độ "Từ chưa biết", tính tỉ lệ đã biết).
 */
import { db, type MyWordRow, type WordState } from './db';

export type { MyWordRow, WordState };

/** Phần hiện của một từ khi đánh dấu. */
export interface WordItem {
  id: string;
  /** cấp HSK 2025 (0 hoặc không có: ngoài HSK 2025) */
  lv?: number;
  s: string;
  p: string;
  hv?: string;
  vi?: string;
}

export const STATE_VI: Record<WordState, string> = { hoc: 'Đang học', biet: 'Đã biết' };

/** Đặt trạng thái cho các từ (null: bỏ đánh dấu). Trả về các dòng cũ (để hoàn tác). */
export async function setWordState(items: readonly WordItem[], st: WordState | null, src: string, now = Date.now()): Promise<(MyWordRow | undefined)[]> {
  const t = await db();
  return t.transaction('rw', t.words, async () => {
    const ids = items.map((x) => x.id);
    const old = await t.words.bulkGet(ids);
    if (st === null) await t.words.bulkDelete(ids);
    else
      await t.words.bulkPut(
        items.map((x, i) => {
          const row: MyWordRow = { itemId: x.id, st, at: now + i, src: old[i]?.src ?? src, s: x.s, p: x.p };
          if (x.lv) row.lv = x.lv;
          if (x.hv) row.hv = x.hv;
          if (x.vi) row.vi = x.vi;
          return row;
        }),
      );
    return old;
  });
}

/** Hoàn tác: đặt lại các dòng cũ (dòng không có trước đó thì xoá). */
export async function restoreWords(ids: readonly string[], old: readonly (MyWordRow | undefined)[]): Promise<void> {
  const t = await db();
  await t.transaction('rw', t.words, async () => {
    await t.words.bulkDelete(ids.filter((_, i) => !old[i]));
    await t.words.bulkPut(old.filter((r): r is MyWordRow => !!r));
  });
}

/** Từ được coi là đã biết: đánh dấu "đã biết", hoặc thuộc HSK 1…knownLevel (trừ khi đang đánh dấu "đang học"). */
export function isKnownWord(id: string, lv: number | undefined, states: ReadonlyMap<string, WordState>, knownLevel: number): boolean {
  const st = states.get(id);
  if (st) return st === 'biet';
  return !!lv && lv <= knownLevel;
}
