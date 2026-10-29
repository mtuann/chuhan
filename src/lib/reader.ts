/**
 * Đọc văn bản tự dán: tách từ, pinyin, từ đã biết. Chạy hoàn toàn trên máy, không gửi văn bản đi đâu.
 *
 * Từ điển: từ HSK (cấp 1–9 và các chuẩn cũ, lấy từ gói tìm kiếm) và từ điển mở rộng (CVDICT) cho các chỗ không
 * có từ HSK. Tách từ bằng cách tìm cách chia rẻ nhất (Viterbi): từ HSK cấp thấp rẻ nhất, cấp càng cao càng đắt, từ
 * điển mở rộng đắt hơn, chữ lẻ không có trong từ điển đắt nhất. Nhờ vậy 学生会说汉语 tách thành 学生 会 说 汉语 (bốn
 * từ cấp 1) chứ không phải 学生会 (hội sinh viên) 说 汉语.
 *
 * Pinyin lấy từ dữ liệu; 一 và 不 đứng riêng đổi thanh theo chữ sau như pipeline nội dung bài.
 * Module thuần (không đọc tệp, không DOM) để test đơn vị.
 */
import type { CharRec } from '../schema/data';
import { parseNumbered, splitMarked, sylsToDisplay, tonesOf } from './pinyin';
import { isHan } from './text';
import { mainHanviet } from './writing';

/** Một dòng của gói tìm kiếm: [id, cấp (0 = ngoài HSK 2025), pinyin, Hán Việt, nghĩa ngắn, nghĩa Anh]. */
export type SearchRowLike = readonly [string, number, string, string, string, string, ...number[]];
/** Mục từ điển mở rộng: [giản thể, phồn thể, pinyin số, nghĩa]. */
export type DictEntryLike = readonly [string, string, string, readonly string[]];

export interface HskEntry {
  id: string;
  /** cấp 1–7; 0: chỉ có trong các chuẩn cũ */
  lv: number;
  p: string;
  hv: string;
  m: string;
}

export interface DictWord {
  p: string;
  m: readonly string[];
  /** tên riêng (pinyin viết hoa) */
  proper: boolean;
  tone: number;
}

export type ReadTok =
  /** từ HSK; `ids` là các từ cùng chữ, từ đang chọn đứng đầu; `alt`: có cách đọc khác (máy đoán) */
  | { kind: 'word'; t: string; p: string; ids: string[]; lv: number; hv: string; m: string; alt: boolean; tone: number }
  /** từ trong từ điển mở rộng, ngoài danh sách HSK */
  | { kind: 'dict'; t: string; p: string; m: readonly string[]; proper: boolean; tone: number; alt: boolean }
  /** chữ Hán không có trong từ điển */
  | { kind: 'char'; t: string }
  | { kind: 'punct'; t: string }
  /** chữ Latinh, chữ số */
  | { kind: 'other'; t: string }
  | { kind: 'space' }
  | { kind: 'break' };

export interface ReaderLexicon {
  hsk: ReadonlyMap<string, HskEntry[]>;
  dict: ReadonlyMap<string, DictWord[]>;
}

/** Độ dài từ dài nhất được thử (từ HSK dài nhất 7 chữ; thành ngữ, tên riêng thường ≤ 8). */
export const MAX_WORD = 8;

/** Gom các dòng gói tìm kiếm theo chuỗi chữ: mỗi chuỗi các từ HSK, cấp thấp trước. */
export function buildHsk(rows: Iterable<SearchRowLike>): Map<string, HskEntry[]> {
  const out = new Map<string, HskEntry[]>();
  for (const [id, lv, p, hv, m] of rows) {
    const s = id.slice(0, id.indexOf('_'));
    const list = out.get(s) ?? [];
    list.push({ id, lv, p, hv, m });
    out.set(s, list);
  }
  const rank = (lv: number) => (lv === 0 ? 8 : lv);
  for (const list of out.values()) list.sort((a, b) => rank(a.lv) - rank(b.lv) || (a.id < b.id ? -1 : 1));
  return out;
}

/** Hiển thị pinyin số của từ điển: "chi2 dao4" → "chídào", "Bei3 jing1" → "Běijīng". */
export function dictPinyin(numbered: string): { p: string; tone: number } {
  const syls = parseNumbered(numbered);
  const tone = tonesOf(numbered)[0] ?? 5;
  if (!syls) return { p: numbered, tone };
  const p = sylsToDisplay(syls);
  return { p: /^[A-Z]/.test(numbered) ? p[0].toUpperCase() + p.slice(1) : p, tone };
}

/** Thêm các mục từ điển mở rộng (đã tải theo tệp) vào bảng tra theo chuỗi giản thể. */
export function addDict(target: Map<string, DictWord[]>, entries: Iterable<DictEntryLike>) {
  for (const [s, , py, m] of entries) {
    const list = target.get(s) ?? [];
    const { p, tone } = dictPinyin(py);
    if (list.some((x) => x.p === p)) continue;
    list.push({ p, m, proper: /^[A-Z]/.test(py), tone });
    // từ thường trước tên riêng
    list.sort((a, b) => Number(a.proper) - Number(b.proper));
    target.set(s, list);
  }
}

const COST_LV = [11.5, 5, 6, 7, 8, 9, 10, 11];
const COST_DICT_CHAR = 14;
const COST_UNKNOWN = 20;
const dictCost = (len: number) => (len === 1 ? COST_DICT_CHAR : Math.max(11, 13 - 0.5 * (len - 2)));

const firstTone = (id: string) => tonesOf(id.slice(id.indexOf('_') + 1))[0] ?? 5;

function wordTok(t: string, list: HskEntry[]): ReadTok {
  const e = list[0];
  return { kind: 'word', t, p: e.p, ids: list.map((x) => x.id), lv: e.lv, hv: e.hv, m: e.m, alt: new Set(list.map((x) => x.p)).size > 1, tone: firstTone(e.id) };
}

function dictTok(t: string, list: DictWord[]): ReadTok {
  const d = list[0];
  return { kind: 'dict', t, p: d.p, m: d.m, proper: d.proper, tone: d.tone, alt: list.length > 1 };
}

/** Tách một dãy chữ Hán liền nhau thành từ (cách chia có tổng chi phí nhỏ nhất). */
export function segmentRun(run: string, lex: ReaderLexicon): ReadTok[] {
  const chars = [...run];
  const n = chars.length;
  const best = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<{ from: number; tok: ReadTok } | undefined>(n + 1);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    for (let len = Math.min(MAX_WORD, n - i); len >= 1; len--) {
      const s = chars.slice(i, i + len).join('');
      const hs = lex.hsk.get(s);
      const ds = hs ? undefined : lex.dict.get(s);
      let cost: number;
      let tok: ReadTok;
      if (hs) {
        cost = COST_LV[hs[0].lv] ?? COST_LV[0];
        tok = wordTok(s, hs);
      } else if (ds?.length) {
        cost = dictCost(len);
        tok = dictTok(s, ds);
      } else if (len === 1) {
        cost = COST_UNKNOWN;
        tok = { kind: 'char', t: s };
      } else continue;
      if (best[i] + cost < best[i + len]) {
        best[i + len] = best[i] + cost;
        back[i + len] = { from: i, tok };
      }
    }
  }
  const out: ReadTok[] = [];
  for (let j = n; j > 0; ) {
    const b = back[j]!;
    out.push(b.tok);
    j = b.from;
  }
  return out.reverse();
}

const PUNCT = /[\p{P}\p{S}]/u;

/** Tách cả văn bản: dãy chữ Hán qua `segmentRun`, dấu câu, chữ Latinh/số, khoảng trắng, xuống dòng. */
export function segment(text: string, lex: ReaderLexicon): ReadTok[] {
  const out: ReadTok[] = [];
  let run = '';
  let other = '';
  const flushRun = () => {
    if (run) out.push(...segmentRun(run, lex));
    run = '';
  };
  const flushOther = () => {
    if (other) out.push({ kind: 'other', t: other });
    other = '';
  };
  for (const ch of text.normalize('NFC').replace(/\r\n?/g, '\n')) {
    if (isHan(ch)) {
      flushOther();
      run += ch;
      continue;
    }
    flushRun();
    if (ch === '\n') {
      flushOther();
      if (out.length && out[out.length - 1].kind !== 'break') out.push({ kind: 'break' });
    } else if (/\s/u.test(ch)) {
      flushOther();
      const last = out[out.length - 1];
      if (last && last.kind !== 'space' && last.kind !== 'break') out.push({ kind: 'space' });
    } else if (PUNCT.test(ch)) {
      flushOther();
      out.push({ kind: 'punct', t: ch });
    } else other += ch;
  }
  flushRun();
  flushOther();
  while (out.length && (out[out.length - 1].kind === 'space' || out[out.length - 1].kind === 'break')) out.pop();
  applySandhi(out);
  return out;
}

/**
 * Chỗ cần từ điển mở rộng: chữ Hán chưa thuộc từ HSK nào khi chỉ tách bằng từ HSK. Trả các chữ đầu cần tải tệp
 * từ điển (một chữ có thể bắt đầu một từ dài hơn, nên lấy cả chữ đứng trước chỗ trống).
 */
export function dictNeeds(text: string, hsk: ReadonlyMap<string, HskEntry[]>): string[] {
  const toks = segment(text, { hsk, dict: new Map() });
  const need = new Set<string>();
  toks.forEach((t, i) => {
    if (t.kind !== 'char') return;
    need.add(t.t);
    const prev = toks[i - 1];
    if (prev && (prev.kind === 'word' || prev.kind === 'char')) for (const c of prev.t) need.add(c);
  });
  return [...need];
}

// ---------------------------------------------------------------- biến điệu

// 两 không ở đây: 一 两 个 (một hai cái) đọc yì liǎng
const NUM_PLAIN_NEXT = new Set([...'零一二三四五六七八九十']);
const NUM_PREV = new Set([...'零一二三四五六七八九十百千']);
const YI_PLAIN_BEFORE = new Set([...'月号日点']);
const YI_PLAIN_AFTER = new Set(['第', '星期']);

const toneOf = (t: ReadTok | undefined) => (t && (t.kind === 'word' || t.kind === 'dict') ? t.tone : 0);

/**
 * 一 và 不 đứng riêng (trong từ thì dữ liệu đã ghi sẵn): 不 → bú trước thanh 4; 一 → yī khi đứng cuối, sau 第/星期/số,
 * trước số hoặc 月/号/日/点, yí trước thanh 4, yì trước thanh 1–3. Hỏi chính phản A 不 A, A 一 A: đọc nhẹ bu, yi.
 */
export function applySandhi(toks: ReadTok[]) {
  toks.forEach((tk, i) => {
    if (tk.kind !== 'word' || (tk.t !== '一' && tk.t !== '不')) return;
    const prev = toks[i - 1];
    const next = toks[i + 1];
    const same = prev && next && prev.kind === 'word' && next.kind === 'word' && prev.t === next.t && [...prev.t].length === 1;
    if (tk.t === '不') {
      tk.p = same ? 'bu' : toneOf(next) === 4 ? 'bú' : 'bù';
      return;
    }
    const nt = toneOf(next);
    if (same) tk.p = 'yi';
    else if (prev?.kind === 'word' && (YI_PLAIN_AFTER.has(prev.t) || NUM_PREV.has(prev.t))) tk.p = 'yī';
    else if (!nt || (next && 't' in next && (NUM_PLAIN_NEXT.has(next.t) || YI_PLAIN_BEFORE.has(next.t)))) tk.p = 'yī';
    else tk.p = nt >= 4 ? 'yí' : 'yì';
  });
}

// ---------------------------------------------------------------- đếm

export interface Coverage {
  /** số từ (lượt xuất hiện) tính độ phủ: từ HSK và từ điển mở rộng, không tính tên riêng */
  total: number;
  known: number;
  /** các từ chưa biết khác nhau, theo thứ tự xuất hiện */
  unknown: ReadTok[];
}

/** Độ phủ theo từ đã biết: một lượt xuất hiện là "biết" nếu một trong các từ HSK cùng chữ đã biết (`known(id, cấp)`). */
export function coverage(toks: readonly ReadTok[], known: (id: string, lv?: number) => boolean): Coverage {
  let total = 0;
  let k = 0;
  const seen = new Set<string>();
  const unknown: ReadTok[] = [];
  for (const t of toks) {
    if (t.kind === 'dict' && t.proper) continue;
    if (t.kind !== 'word' && t.kind !== 'dict' && t.kind !== 'char') continue;
    total++;
    if (t.kind === 'word' && t.ids.some((id) => known(id, t.lv))) {
      k++;
      continue;
    }
    if (!seen.has(t.t)) {
      seen.add(t.t);
      unknown.push(t);
    }
  }
  return { total, known: k, unknown };
}

/** Chia token thành câu (để nghe từng câu): hết câu ở 。！？!? và xuống dòng. */
export function sentences(toks: readonly ReadTok[]): ReadTok[][] {
  const out: ReadTok[][] = [[]];
  for (const t of toks) {
    if (t.kind === 'break') {
      if (out[out.length - 1].length) out.push([]);
      continue;
    }
    out[out.length - 1].push(t);
    if (t.kind === 'punct' && /[。！？!?…]/.test(t.t)) out.push([]);
  }
  return out.filter((s) => s.some((t) => t.kind !== 'space'));
}

export const tokText = (t: ReadTok) => (t.kind === 'space' ? ' ' : t.kind === 'break' ? '\n' : t.t);

/** Thông tin một từ HSK để hiện khi đọc câu có sẵn token (bài đọc của app). */
export interface WordLook {
  lv: number;
  hv: string;
  m: string;
}

/**
 * Câu của nội dung app ([chữ] | [chữ, pinyin] | [chữ, pinyin, id từ]) → token đọc. Pinyin giữ nguyên như câu (đã có
 * biến điệu, thanh nhẹ); [chữ, pinyin] là tên riêng.
 */
export function fromTokens(tk: readonly (readonly string[])[], look: (id: string) => WordLook | undefined): ReadTok[] {
  return tk.map((t): ReadTok => {
    if (t.length === 1) return PUNCT.test(t[0]) ? { kind: 'punct', t: t[0] } : isHan(t[0]) ? { kind: 'char', t: t[0] } : { kind: 'other', t: t[0] };
    const tone = 5;
    if (t.length === 2) return { kind: 'dict', t: t[0], p: t[1], m: [], proper: true, tone, alt: false };
    const w = look(t[2]);
    return { kind: 'word', t: t[0], p: t[1], ids: [t[2]], lv: w?.lv ?? 0, hv: w?.hv ?? '', m: w?.m ?? '', alt: false, tone: tonesOf(t[2].slice(t[2].indexOf('_') + 1))[0] ?? tone };
  });
}

/**
 * Âm Hán Việt của tên riêng, ghép từng chữ theo cách đọc trong pinyin rồi viết hoa: 河内 Hénèi → "Hà Nội",
 * 陈安 Chén Ān → "Trần An". Không tách được pinyin thì lấy âm chính của chữ; thiếu âm của chữ nào thì trả ''.
 */
export function nameHanviet(text: string, p: string, rec: (c: string) => Pick<CharRec, 'py' | 'hv'> | undefined): string {
  const chars = [...text];
  if (!chars.length || !chars.every(isHan)) return '';
  const syls = splitMarked(p, chars.length);
  const parts = chars.map((c, i) => {
    const r = rec(c);
    const key = syls ? `${syls[i].base}${syls[i].tone}` : '';
    return (key && r?.hv?.[key]?.[0]) || mainHanviet(r)[0] || '';
  });
  if (parts.some((x) => !x)) return '';
  return parts.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
}
