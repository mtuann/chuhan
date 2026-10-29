/**
 * Bộ gõ pinyin chạy ngay trong trình duyệt, cách dùng như Sogou hay Microsoft Pinyin: gõ pinyin không dấu thanh (ü gõ
 * bằng v), chọn chữ trong danh sách gợi ý bằng phím số, phím cách hoặc chạm. Gõ được cả từ (xuexi → 学习), gõ dở
 * (xuex → 学习, 学校) và gõ tắt bằng chữ cái đầu (xs → 学生).
 *
 * Từ điển gợi ý dựng từ gói tìm kiếm: mọi từ HSK (kèm hạng tần suất) và từng chữ tách ra từ các từ đó (习 trong 学习).
 * Mỗi gợi ý có pinyin có dấu, âm Hán Việt và nghĩa: người Việt phân biệt chữ cùng âm (在 tại / 再 tái) nhờ Hán Việt.
 * Module thuần (không DOM) để test đơn vị.
 */
import { SYLLABLES, parseNumbered, splitMarked } from './pinyin';
import type { SearchRowLike } from './reader';

export interface ImeEntry {
  /** chữ Hán */
  t: string;
  /** âm tiết không dấu (ü viết v) */
  syl: readonly string[];
  /** pinyin có dấu */
  p: string;
  /** âm Hán Việt (mỗi chữ một âm, cách nhau dấu cách) */
  hv: string;
  /** nghĩa ngắn */
  m: string;
  /** cấp HSK 2025 (1–7); 0: ngoài danh sách 2025 */
  lv: number;
  /** id từ HSK (chữ tách từ một từ thì không có) */
  id?: string;
  /** chữ tách từ từ này */
  of?: string;
  /** điểm xếp hạng: nhỏ là hay gặp */
  rank: number;
  /** gợi ý ghép nhiều từ (gõ cả câu): các từ thành phần */
  parts?: ImeEntry[];
}

export interface ImeLexicon {
  /** âm tiết đầu → các mục, xếp theo độ hay gặp */
  byFirst: Map<string, ImeEntry[]>;
  /** chữ → các âm tiết của chữ (đoán âm của chữ gõ bằng bộ gõ của máy) */
  charSyl: Map<string, Set<string>>;
  /** chữ → mục hay gặp nhất của chữ (Hán Việt, nghĩa khi giải thích lỗi) */
  charInfo: Map<string, ImeEntry>;
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c);
/** Hạng ước lượng khi từ không có hạng tần suất: theo cấp. */
const LEVEL_RANK: Record<number, number> = { 1: 2500, 2: 4000, 3: 6000, 4: 9000, 5: 13000, 6: 17000, 7: 25000, 0: 35000 };
/** Chữ tách từ từ xếp sau chính từ đó một chút. */
const CHAR_PENALTY = 40;

/** Một hai nghĩa đầu, đủ ngắn để hiện trong danh sách gợi ý. */
export function shortMeaning(vi: string, max = 28): string {
  const parts = vi
    .split(/\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  let out = parts[0] ?? '';
  if (parts[1] && out.length + parts[1].length + 2 <= max) out += `; ${parts[1]}`;
  return out.length > max ? `${out.slice(0, max - 1)}…` : out;
}

function push(map: Map<string, ImeEntry[]>, e: ImeEntry) {
  const k = e.syl[0];
  const list = map.get(k);
  if (list) list.push(e);
  else map.set(k, [e]);
}

/** Dựng từ điển gợi ý từ các dòng của gói tìm kiếm ([id, cấp, pinyin, Hán Việt, nghĩa, nghĩa Anh, hạng?]). */
export function buildImeLexicon(rows: Iterable<SearchRowLike>): ImeLexicon {
  const byFirst = new Map<string, ImeEntry[]>();
  const words: ImeEntry[] = [];
  for (const r of rows) {
    const [id, lv, p, hv, vi] = r;
    const q = r[6];
    const i = id.indexOf('_');
    const t = id.slice(0, i);
    const chars = [...t];
    if (!chars.length || !chars.every(isHan)) continue;
    const syls = parseNumbered(id.slice(i + 1));
    if (!syls || syls.length !== chars.length) continue;
    words.push({ t, syl: syls.map((s) => s.base), p, hv, m: shortMeaning(vi), lv, id, rank: q ?? LEVEL_RANK[lv] ?? 40000 });
  }
  // chữ tách từ từ: mỗi (chữ, âm) một mục, lấy từ hay gặp nhất chứa nó
  const single = new Set(words.filter((w) => w.syl.length === 1).map((w) => `${w.t}|${w.syl[0]}`));
  const derived = new Map<string, ImeEntry>();
  for (const w of words) {
    if (w.syl.length < 2) continue;
    const chars = [...w.t];
    const hvs = w.hv.split(/\s+/);
    let marked: string[] | null = null;
    chars.forEach((c, k) => {
      const s = w.syl[k];
      if (s === 'r') return; // 儿 hoá
      const key = `${c}|${s}`;
      if (single.has(key)) return;
      const rank = w.rank + CHAR_PENALTY;
      const cur = derived.get(key);
      if (cur && cur.rank <= rank) return;
      // pinyin có dấu của chữ: cắt từ pinyin của từ chứa nó
      marked ??= splitMarked(w.p.toLowerCase(), chars.length)?.map((x) => x.text) ?? [];
      derived.set(key, { t: c, syl: [s], p: marked[k] ?? '', hv: hvs.length === chars.length ? hvs[k] : '', m: '', lv: w.lv, of: w.t, rank });
    });
  }
  const all = [...words, ...derived.values()];
  const charSyl = new Map<string, Set<string>>();
  const charInfo = new Map<string, ImeEntry>();
  for (const e of all) {
    push(byFirst, e);
    if (e.syl.length === 1) {
      const set = charSyl.get(e.t) ?? new Set<string>();
      set.add(e.syl[0]);
      charSyl.set(e.t, set);
      const cur = charInfo.get(e.t);
      if (!cur || e.rank < cur.rank) charInfo.set(e.t, e);
    }
  }
  for (const list of byFirst.values()) list.sort((a, b) => a.rank - b.rank);
  return { byFirst, charSyl, charInfo };
}

/** Thêm tên riêng của bài đang luyện ([chữ, pinyin có dấu]) để gõ được: 陈安 Chén Ān. */
export function addNames(lex: ImeLexicon, names: Iterable<readonly [string, string]>): void {
  for (const [t, p] of names) {
    const chars = [...t];
    const syls = splitMarked(p.toLowerCase(), chars.length);
    if (!syls || !chars.every(isHan)) continue;
    const syl = syls.map((s) => s.base);
    const list = lex.byFirst.get(syl[0]) ?? [];
    if (list.some((e) => e.t === t)) continue;
    const e: ImeEntry = { t, syl, p, hv: '', m: 'tên riêng', lv: 0, rank: 300 };
    list.unshift(e);
    lex.byFirst.set(syl[0], list);
    chars.forEach((c, k) => {
      const set = lex.charSyl.get(c) ?? new Set<string>();
      set.add(syl[k]);
      lex.charSyl.set(c, set);
    });
  }
}

// ---------------------------------------------------------------- tách chuỗi gõ

/** Phụ âm đầu dùng để gõ tắt (xs → 学生). */
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const INITIAL_SET = new Set(INITIALS);
/** Âm tiết đặc biệt không dùng khi gõ (hm, hng, m, n, ng); r chỉ dùng sau một âm tiết khác (儿 hoá). */
const NO_TYPE = new Set(['hm', 'hng', 'm', 'n', 'ng']);
const TYPABLE = [...SYLLABLES].filter((s) => !NO_TYPE.has(s));
const SYL_SET = new Set(TYPABLE);
/** Mọi tiền tố của âm tiết (gõ dở âm cuối: zho → zhong, zhou…). */
const PREFIXES = new Set(TYPABLE.flatMap((s) => Array.from({ length: s.length }, (_, k) => s.slice(0, k + 1))));
const MAX_SYL = 6;

export type PieceKind = 'syl' | 'ini' | 'pre';
export interface Piece {
  s: string;
  k: PieceKind;
  /** vị trí kết thúc trong chuỗi gõ (kể cả dấu ') */
  end: number;
}

const PENALTY: Record<PieceKind, number> = { syl: 0, pre: 1, ini: 2 };

/**
 * Các cách tách chuỗi gõ thành âm tiết, cách tốt nhất trước (ít gõ tắt, ít mảnh): "xian" → [xian], [xi an]…;
 * dấu ' bắt buộc tách ("xi'an"). Mảnh cuối có thể là âm tiết gõ dở.
 */
export function segment(input: string, max = 6): Piece[][] {
  const s = input.toLowerCase();
  const out: { pieces: Piece[]; score: number }[] = [];
  const n = s.length;
  let budget = 4000;
  const walk = (i: number, acc: Piece[]) => {
    if (--budget < 0) return;
    while (i < n && s[i] === "'") i++;
    if (i >= n) {
      if (acc.length) out.push({ pieces: acc, score: acc.reduce((x, p) => x + PENALTY[p.k] * 10, 0) + acc.length });
      return;
    }
    let stop = s.indexOf("'", i);
    if (stop < 0) stop = n;
    for (let len = Math.min(MAX_SYL, stop - i); len >= 1; len--) {
      const piece = s.slice(i, i + len);
      const end = i + len;
      const last = end === n || s.slice(end).replace(/'/g, '') === '';
      if (SYL_SET.has(piece) && !(piece === 'r' && !acc.length)) walk(end, [...acc, { s: piece, k: 'syl', end }]);
      else if (last && PREFIXES.has(piece)) walk(end, [...acc, { s: piece, k: 'pre', end }]);
      else if (INITIAL_SET.has(piece)) walk(end, [...acc, { s: piece, k: 'ini', end }]);
    }
  };
  walk(0, []);
  out.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const res: Piece[][] = [];
  for (const o of out) {
    const key = o.pieces.map((p) => `${p.s}${p.k}`).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(o.pieces);
    if (res.length >= max) break;
  }
  return res;
}

/** Chuỗi gõ hiện kèm dấu tách âm tiết như bộ gõ thật: "xuexi" → "xue'xi". */
export function showInput(input: string): string {
  const best = segment(input, 1)[0];
  return best ? best.map((p) => p.s).join("'") : input;
}

// ---------------------------------------------------------------- gợi ý

export interface Candidate {
  e: ImeEntry;
  /** số ký tự đầu của chuỗi gõ đã dùng (kể cả dấu ') */
  used: number;
  /** khớp hết chuỗi gõ */
  full: boolean;
  score: number;
}

const ALL_FIRST = TYPABLE;
/**
 * Âm tiết có khớp một mảnh không: 0 khớp trọn, 1 khớp không trọn (gõ tắt, gõ dở), -1 không khớp. Gõ tắt bằng chữ cái
 * đầu như bộ gõ thật: s lấy cả sh (xs → 学生).
 */
function fits(syl: string, piece: Piece, last: boolean): 0 | 1 | -1 {
  if (piece.k === 'syl') {
    if (syl === piece.s) return 0;
    return last && syl.startsWith(piece.s) ? 1 : -1;
  }
  return syl.startsWith(piece.s) ? 1 : -1;
}

/** Các mục bắt đầu ở mảnh thứ i và khớp các mảnh tiếp theo: [mục, số mảnh, số mảnh khớp không trọn]. */
function* matchesAt(lex: ImeLexicon, pieces: readonly Piece[], i: number): Generator<[ImeEntry, number, number]> {
  const n = pieces.length;
  const p0 = pieces[i];
  const firsts = p0.k === 'syl' && i < n - 1 ? [p0.s] : ALL_FIRST.filter((x) => fits(x, p0, i === n - 1) >= 0);
  for (const f of firsts) {
    for (const e of lex.byFirst.get(f) ?? []) {
      const m = e.syl.length;
      if (i + m > n) continue;
      let inexact = 0;
      let ok = true;
      for (let j = 0; j < m; j++) {
        const r = fits(e.syl[j], pieces[i + j], i + j === n - 1);
        if (r < 0) {
          ok = false;
          break;
        }
        inexact += r;
      }
      if (ok) yield [e, m, inexact];
    }
  }
}

/** Mỗi từ thêm vào câu ghép bị tính thêm điểm: ít từ (từ dài) tốt hơn nhiều chữ lẻ. */
const WORD_COST = 2000;

/**
 * Ghép cả chuỗi gõ thành câu từ các từ hay gặp nhất (gõ cả câu như bộ gõ thật: woaini → 我爱你). Chỉ dùng cách tách tốt
 * nhất; trả null nếu không ghép được.
 */
export function compose(lex: ImeLexicon, pieces: readonly Piece[]): ImeEntry | null {
  const n = pieces.length;
  if (n < 2) return null;
  const best: ({ cost: number; prev: number; e: ImeEntry } | undefined)[] = new Array(n + 1);
  best[0] = { cost: 0, prev: -1, e: undefined as unknown as ImeEntry };
  for (let i = 0; i < n; i++) {
    const from = best[i];
    if (!from) continue;
    for (const [e, m, inexact] of matchesAt(lex, pieces, i)) {
      const cost = from.cost + e.rank + WORD_COST + inexact * 3000;
      const cur = best[i + m];
      if (!cur || cost < cur.cost) best[i + m] = { cost, prev: i, e };
    }
  }
  if (!best[n]) return null;
  const parts: ImeEntry[] = [];
  for (let k = n; k > 0; k = best[k]!.prev) parts.unshift(best[k]!.e);
  if (parts.length < 2) return null;
  return {
    t: parts.map((e) => e.t).join(''),
    syl: parts.flatMap((e) => e.syl),
    p: parts.map((e) => e.p).join(' '),
    hv: parts.map((e) => e.hv).join(' '),
    m: '',
    lv: Math.max(...parts.map((e) => e.lv)),
    rank: 0,
    parts,
  };
}

/**
 * Danh sách gợi ý cho chuỗi gõ: khớp hết chuỗi trước (từ hay gặp trước; không có từ nào thì câu ghép từ nhiều từ), rồi
 * các từ khớp phần đầu theo cách tách tốt nhất (chọn xong gõ tiếp phần còn lại).
 */
export function candidates(lex: ImeLexicon, input: string, limit = 60): Candidate[] {
  const segs = segment(input);
  const best = new Map<string, Candidate>();
  const add = (c: Candidate) => {
    const cur = best.get(c.e.t);
    if (!cur || c.score < cur.score) best.set(c.e.t, c);
  };
  segs.forEach((pieces, si) => {
    for (const [e, m, inexact] of matchesAt(lex, pieces, 0)) {
      const full = m === pieces.length;
      // khớp một phần: chỉ lấy theo cách tách tốt nhất (cách tách lạ cho ra gợi ý khó hiểu)
      if (!full && si > 0) continue;
      add({ e, used: pieces[m - 1].end, full, score: (full ? 0 : 1e9 - m * 1e7) + si * 1e5 + inexact * 5e4 + e.rank });
    }
  });
  // câu ghép: chỉ khi gõ đủ từng âm tiết (không gõ tắt, không gõ dở) và không có từ nào khớp trọn
  const top = segs[0];
  if (top && top.length >= 2 && top.every((p) => p.k === 'syl') && ![...best.values()].some((c) => c.full && c.score < 5e4)) {
    const e = compose(lex, top);
    if (e) add({ e, used: top[top.length - 1].end, full: true, score: -1 });
  }
  return [...best.values()].sort((a, b) => a.score - b.score).slice(0, limit);
}

/** Phần chuỗi gõ còn lại sau khi chọn một gợi ý. */
export function rest(input: string, c: Pick<Candidate, 'used'>): string {
  return input.slice(c.used).replace(/^'+/, '');
}

// ---------------------------------------------------------------- bàn phím tiếng Việt

const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu;
/** Chuỗi có chữ tiếng Việt có dấu: bộ gõ Telex/VNI đang bật (s f r x j thành dấu, dd thành đ…). */
export const hasVietnamese = (s: string) => VI_MARKS.test(s.normalize('NFC'));

/**
 * Dấu câu gõ khi không có chuỗi pinyin: đổi sang dấu câu Trung Quốc như Sogou, Microsoft Pinyin (\\ ra 、, ^ ra ……,
 * _ ra ——). Dấu " thì ô gõ tự chọn “ hay ” theo dấu mở trước đó.
 */
export const PUNCT: Record<string, string> = {
  ',': '，',
  '.': '。',
  '?': '？',
  '!': '！',
  ':': '：',
  ';': '；',
  '\\': '、',
  '<': '《',
  '>': '》',
  '(': '（',
  ')': '）',
  '^': '……',
  '_': '——',
};
