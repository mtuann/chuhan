/**
 * Viết tay: tách văn bản thành ô chữ (xem cách viết), trạng thái tập viết từng chữ, bố cục trang in 田字格.
 * Chỉ có hàm thuần, không đụng tới DOM hay IndexedDB (để test đơn vị).
 */
import type { CharRec } from '../schema/data';
import type { WriteGrade } from './grade';
import { splitMarked } from './pinyin';
import type { ReadTok } from './reader';
import { isHan } from './text';

// ---------------------------------------------------------------- thông tin chữ

/**
 * Cách đọc chính để hiện khi tập viết và in: các cách đọc có âm Hán Việt (bỏ cách đọc hiếm chỉ gặp trong từ điển,
 * như én của 人), theo thứ tự trong dữ liệu; không có thì cách đọc đầu tiên.
 */
export function mainReadings(rec?: Pick<CharRec, 'py' | 'hv'>): string[] {
  const py = rec?.py ?? [];
  const withHv = py.filter((k) => rec?.hv?.[k]);
  return withHv.length ? withHv : py.slice(0, 1);
}

/** Âm Hán Việt ứng với các cách đọc chính (kể cả âm không gắn với cách đọc nào). */
export function mainHanviet(rec?: Pick<CharRec, 'py' | 'hv'>): string[] {
  const hv = rec?.hv ?? {};
  return [...new Set([...mainReadings(rec), '*'].flatMap((k) => hv[k] ?? []))];
}

// ---------------------------------------------------------------- tách văn bản

export type Cell =
  /** chữ Hán; `i` là thứ tự trong các chữ Hán của văn bản */
  | { kind: 'han'; c: string; i: number }
  /** dấu câu, chữ số, chữ Latinh: hiện nguyên, không có ô 田字格 */
  | { kind: 'other'; c: string }
  | { kind: 'space' }
  | { kind: 'break' };

/** Số chữ Hán tối đa của trang Xem cách viết (mỗi chữ một ô animation). */
export const MAX_HAN = 200;

/** Tách văn bản thành ô. Khoảng trắng liền nhau gộp một; nhiều dòng trống gộp một lần xuống dòng. */
export function splitCells(text: string, max = MAX_HAN): { cells: Cell[]; han: string[]; cut: boolean } {
  const cells: Cell[] = [];
  const han: string[] = [];
  let cut = false;
  for (const ch of text.normalize('NFC')) {
    const last = cells[cells.length - 1];
    if (ch === '\n' || ch === '\r') {
      if (last && last.kind !== 'break') {
        if (last.kind === 'space') cells.pop();
        cells.push({ kind: 'break' });
      }
      continue;
    }
    if (/\s/u.test(ch)) {
      if (last && last.kind !== 'space' && last.kind !== 'break') cells.push({ kind: 'space' });
      continue;
    }
    if (isHan(ch)) {
      if (han.length >= max) {
        cut = true;
        break;
      }
      cells.push({ kind: 'han', c: ch, i: han.length });
      han.push(ch);
    } else cells.push({ kind: 'other', c: ch });
  }
  while (cells.length && (cells[cells.length - 1].kind === 'space' || cells[cells.length - 1].kind === 'break')) cells.pop();
  return { cells, han, cut };
}

/** Cách đọc của một ô chữ trong câu (Xem cách viết): âm tiết của chữ lấy từ từ chứa nó (tách từ như trang Đọc). */
export interface CellReading {
  /** âm tiết có dấu của chữ này, ví dụ "háng" trong 银行 */
  p: string;
  tone: number;
  /** âm Hán Việt của chữ này trong từ (nếu từ có Hán Việt và khớp số chữ) */
  hv?: string;
  /** vị trí token chứa chữ (để đổi cách đọc cả từ) */
  tok: number;
  /** máy đoán cách đọc (chữ nhiều cách đọc) */
  alt: boolean;
  /** id các từ HSK cùng chữ của token (để biết đã biết chưa) */
  ids: readonly string[];
  /** cấp HSK của từ (0: ngoài HSK) */
  lv: number;
  /** từ chứa chữ, pinyin và nghĩa của cả từ */
  word: string;
  wordP: string;
  m?: string;
}

/**
 * Gán cách đọc cho từng chữ Hán (theo thứ tự chữ Hán trong văn bản, như `splitCells`) từ kết quả tách từ.
 * Chữ không tách được âm tiết (không có trong từ điển, âm "r" của 儿 nhập vào chữ trước…) là `null`.
 */
export function cellReadings(toks: readonly ReadTok[], count: number): (CellReading | null)[] {
  const out: (CellReading | null)[] = [];
  toks.forEach((t, ti) => {
    if (out.length >= count) return;
    if (t.kind === 'space' || t.kind === 'break' || t.kind === 'punct') return;
    const chars = [...t.t];
    const hanChars = chars.filter(isHan);
    if (!hanChars.length) return;
    if (t.kind === 'char' || t.kind === 'other' || hanChars.length !== chars.length) {
      for (let k = 0; k < hanChars.length; k++) out.push(null);
      return;
    }
    const syls = splitMarked(t.p, chars.length, { lenient: true });
    const hvs = t.kind === 'word' && t.hv ? t.hv.trim().split(/\s+/) : [];
    chars.forEach((_, k) => {
      const y = syls && syls.length === chars.length ? syls[k] : null;
      out.push(
        y
          ? {
              p: t.kind === 'dict' && t.proper ? y.text : y.text.toLowerCase(),
              tone: y.tone,
              hv: hvs.length === chars.length ? hvs[k] : undefined,
              tok: ti,
              alt: t.alt,
              ids: t.kind === 'word' ? t.ids : [],
              lv: t.kind === 'word' ? t.lv : 0,
              word: t.t,
              wordP: t.p,
              m: t.kind === 'word' ? t.m : t.m[0],
            }
          : null,
      );
    });
  });
  return out.slice(0, count);
}

/** Các chữ Hán khác nhau theo thứ tự xuất hiện. */
export const uniqueHan = (text: string): string[] => [...new Set([...text.normalize('NFC')].filter(isHan))];

// ---------------------------------------------------------------- tập viết

/** Một lượt tự viết đã lưu (bảng attempts, kind 'write'). */
export interface WriteAttemptLike {
  itemId?: string;
  at: number;
  data?: Record<string, unknown>;
}

export interface LastWrite {
  grade: WriteGrade;
  at: number;
}

const isGrade = (g: unknown): g is WriteGrade => g === 'good' || g === 'hard' || g === 'again';

/** Kết quả lần tự viết gần nhất của từng chữ. */
export function lastWrites(attempts: readonly WriteAttemptLike[]): Map<string, LastWrite> {
  const out = new Map<string, LastWrite>();
  for (const a of attempts) {
    const g = a.data?.grade;
    if (!a.itemId || !isGrade(g)) continue;
    const cur = out.get(a.itemId);
    if (!cur || a.at >= cur.at) out.set(a.itemId, { grade: g, at: a.at });
  }
  return out;
}

/**
 * `n` chữ cho lượt luyện tiếp theo: tối đa 3 chữ lần trước viết sai (Quên), rồi chữ chưa luyện theo thứ tự danh
 * sách, rồi chữ còn lỗi (Khó), rồi các chữ sai còn lại. Chữ đã viết đúng (Nhớ) không lấy; nếu mọi chữ đều đúng thì
 * ôn lại các chữ viết đúng lâu nhất.
 */
export function practiceQueue(list: readonly string[], last: ReadonlyMap<string, LastWrite>, n = 10): string[] {
  const of = (g: WriteGrade) => list.filter((c) => last.get(c)?.grade === g);
  const again = of('again');
  const fresh = list.filter((c) => !last.has(c));
  const picked = [...again.slice(0, 3), ...fresh, ...of('hard'), ...again.slice(3)].slice(0, n);
  if (picked.length) return picked;
  return [...list].sort((a, b) => (last.get(a)?.at ?? 0) - (last.get(b)?.at ?? 0)).slice(0, n);
}

/** Số chữ theo kết quả gần nhất. */
export function writeCounts(list: readonly string[], last: ReadonlyMap<string, LastWrite>): Record<WriteGrade | 'none', number> {
  const out = { good: 0, hard: 0, again: 0, none: 0 };
  for (const c of list) out[last.get(c)?.grade ?? 'none']++;
  return out;
}

// ---------------------------------------------------------------- trang in

/** Bề rộng vùng in của khổ A4 dọc với lề 15 mm (mm). */
export const PAPER_MM = 180;
export const BOX_SIZES = [12, 15, 18, 20] as const;
export type BoxMm = (typeof BOX_SIZES)[number];

/** Số ô 田字格 trên một hàng. */
export const boxesPerRow = (boxMm: number, width = PAPER_MM) => Math.max(1, Math.floor(width / boxMm + 1e-9));

export type BoxKind = 'model' | 'faded' | 'empty';

/** Hàng luyện thứ `row` của một chữ: hàng đầu là ô mẫu, `faded` ô tô mờ, còn lại ô trống; các hàng sau để trống. */
export function practiceRow(row: number, perRow: number, faded: number): BoxKind[] {
  return Array.from({ length: perRow }, (_, i): BoxKind => (row > 0 ? 'empty' : i === 0 ? 'model' : i <= faded ? 'faded' : 'empty'));
}

/** Ô của hàng thứ tự nét: ô k vẽ k nét đầu. Chia thành các hàng `perRow` ô. */
export function orderRows(strokes: number, perRow: number): number[][] {
  const rows: number[][] = [];
  for (let k = 1; k <= strokes; k++) {
    if ((k - 1) % perRow === 0) rows.push([]);
    rows[rows.length - 1].push(k);
  }
  return rows;
}

/** Cỡ ô hàng thứ tự nét: nhỏ hơn ô luyện, không quá 10 mm. */
export const orderBoxMm = (boxMm: number) => Math.min(10, Math.round(boxMm * 0.6 * 2) / 2);
