/**
 * Luyện gõ chữ: chấm chữ gõ so với chữ đích (căn hai chuỗi từng chữ), phân loại lỗi (chọn nhầm chữ cùng âm, gõ sai
 * âm, sai dấu câu, thiếu, thừa) kèm mẹo theo lỗi hay gặp của người Việt (zh/z, -n/-ng, ü gõ v, bật hơi…; dùng ， khi
 * liệt kê thay cho 、), tìm các bộ từ cùng âm dễ chọn nhầm, tổng hợp lỗi của người học. Module thuần để test đơn vị.
 */
import type { Token } from '../schema/data';
import type { ImeLexicon } from './ime';
import { parseNumbered, splitMarked } from './pinyin';
import type { SearchRowLike } from './reader';

const isHan = (c: string) => /\p{Script=Han}/u.test(c);

// ---------------------------------------------------------------- dấu câu

/** Dấu câu tiếng Trung (toàn khổ) được chấm khi bật chấm dấu câu. */
export const ZH_PUNCT = '，、。？！：；“”‘’《》（）…—';
const PUNCT_SET = new Set([...ZH_PUNCT]);
export const isZhPunct = (c: string) => PUNCT_SET.has(c);

/** Tên và phím gõ (bộ gõ của app, như Sogou, Microsoft Pinyin) của từng dấu: dùng khi giải thích lỗi dấu câu. */
export const PUNCT_INFO: Record<string, { name: string; key: string }> = {
  '，': { name: 'dấu phẩy', key: ',' },
  '、': { name: 'dấu ngắt liệt kê', key: '\\' },
  '。': { name: 'dấu chấm tròn', key: '.' },
  '？': { name: 'dấu hỏi', key: '?' },
  '！': { name: 'dấu chấm than', key: '!' },
  '：': { name: 'dấu hai chấm', key: ':' },
  '；': { name: 'dấu chấm phẩy', key: ';' },
  '“': { name: 'mở ngoặc kép', key: '"' },
  '”': { name: 'đóng ngoặc kép', key: '"' },
  '‘': { name: 'mở ngoặc kép đơn', key: "'" },
  '’': { name: 'đóng ngoặc kép đơn', key: "'" },
  '《': { name: 'mở ngoặc tên sách', key: '<' },
  '》': { name: 'đóng ngoặc tên sách', key: '>' },
  '（': { name: 'mở ngoặc đơn', key: '(' },
  '）': { name: 'đóng ngoặc đơn', key: ')' },
  '…': { name: 'dấu chấm lửng', key: '^' },
  '—': { name: 'dấu gạch ngang', key: '_' },
};
/** Thông tin của một dấu (…… và —— tra theo chữ đầu). */
export const punctInfo = (m: string) => PUNCT_INFO[m] ?? PUNCT_INFO[[...m][0]];
/** Dấu viết đủ để hiện: … và — luôn đi đôi (……, ——). */
export const punctShown = (c: string) => (c === '…' ? '……' : c === '—' ? '——' : c);

/** Tuỳ chọn chấm: `punct` chấm cả dấu câu tiếng Trung (thiếu, thừa, sai dấu đều là lỗi). */
export interface CheckOpts {
  punct?: boolean;
}
/** Chữ nào được tính khi chấm: chữ Hán, thêm dấu câu tiếng Trung nếu chấm dấu câu. */
export const scoredBy =
  (o?: CheckOpts) =>
  (c: string): boolean =>
    isHan(c) || (!!o?.punct && isZhPunct(c));

/** Một chữ của câu đích và âm tiết không dấu của nó ('' nếu không rõ). */
export interface TargetChar {
  c: string;
  syl: string;
}
/** Một chữ người học đã gõ; `syl`: âm tiết đã gõ để ra chữ đó (gõ bằng bộ gõ của app). */
export interface TypedChar {
  c: string;
  syl?: string;
  /** nhóm: các chữ của cùng một từ chọn trong một lần (chọn lại chữ thì đổi cả từ) */
  g?: number;
}

/** Âm tiết của một từ theo id: "学习_xue2xi2" → [xue, xi]. */
export function sylOfId(id: string): string[] {
  return (parseNumbered(id.slice(id.indexOf('_') + 1)) ?? []).map((s) => s.base);
}

/**
 * Các chữ Hán của câu (token của dữ liệu) kèm âm tiết: từ lấy theo id, tên riêng theo pinyin. `punct`: lấy cả dấu câu
 * tiếng Trung (âm tiết để trống), để chấm dấu câu khi người học bật.
 */
export function targetChars(tk: readonly Token[], o?: CheckOpts): TargetChar[] {
  const out: TargetChar[] = [];
  for (const t of tk) {
    const chars = [...t[0]];
    if (o?.punct && t.length === 1 && chars.every(isZhPunct)) {
      for (const c of chars) out.push({ c, syl: '' });
      continue;
    }
    if (!chars.some(isHan)) continue;
    let syl: string[] = [];
    if (t.length === 3) syl = sylOfId(t[2]);
    else if (t.length === 2) syl = (splitMarked(t[1].toLowerCase(), chars.length) ?? []).map((s) => s.base);
    chars.forEach((c, k) => {
      if (isHan(c)) out.push({ c, syl: syl.length === chars.length ? syl[k] : '' });
    });
  }
  return out;
}

// ---------------------------------------------------------------- mẹo theo lỗi

export interface SylHint {
  /** nhóm lỗi để thống kê: "zh/z", "-n/-ng", "ü"… */
  key: string;
  tip: string;
}

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
export function splitSyl(s: string): [string, string] {
  const ini = INITIALS.find((i) => s.startsWith(i) && s.length > i.length) ?? '';
  return [ini, s.slice(ini.length)];
}

const pair = (a: string, b: string, x: string, y: string) => (a === x && b === y) || (a === y && b === x);
const INI_HINTS: [string, string, SylHint][] = [
  ['zh', 'z', { key: 'zh/z', tip: 'zh, ch, sh uốn lưỡi; z, c, s đầu lưỡi phẳng' }],
  ['ch', 'c', { key: 'ch/c', tip: 'zh, ch, sh uốn lưỡi; z, c, s đầu lưỡi phẳng' }],
  ['sh', 's', { key: 'sh/s', tip: 'zh, ch, sh uốn lưỡi; z, c, s đầu lưỡi phẳng' }],
  ['l', 'n', { key: 'l/n', tip: 'l và n dễ lẫn: nghe kỹ âm đầu' }],
  ['j', 'zh', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['q', 'ch', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['x', 'sh', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['j', 'z', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['q', 'c', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['x', 's', { key: 'j q x', tip: 'j, q, x chỉ đứng trước i và ü (viết u: ju, qu, xu)' }],
  ['b', 'p', { key: 'bật hơi', tip: 'p, t, k bật hơi mạnh; b, d, g không bật hơi' }],
  ['d', 't', { key: 'bật hơi', tip: 'p, t, k bật hơi mạnh; b, d, g không bật hơi' }],
  ['g', 'k', { key: 'bật hơi', tip: 'p, t, k bật hơi mạnh; b, d, g không bật hơi' }],
  ['r', 'l', { key: 'r', tip: 'r của pinyin gần "r" uốn lưỡi, không phải r hay d tiếng Việt' }],
  ['r', 'y', { key: 'r', tip: 'r của pinyin gần "r" uốn lưỡi, không phải r hay d tiếng Việt' }],
];
const NG: [string, string][] = [
  ['an', 'ang'],
  ['en', 'eng'],
  ['in', 'ing'],
  ['ian', 'iang'],
  ['uan', 'uang'],
];

/** Mẹo khi gõ ra âm `got` thay vì âm đúng `target`. */
export function sylHint(target: string, got: string): SylHint {
  const [ti, tf] = splitSyl(target);
  const [gi, gf] = splitSyl(got);
  if (tf === gf && ti !== gi) {
    const h = INI_HINTS.find(([a, b]) => pair(ti, gi, a, b));
    if (h) return h[2];
  }
  if (ti === gi && tf !== gf) {
    if (NG.some(([a, b]) => pair(tf, gf, a, b))) return { key: '-n/-ng', tip: 'vần -n (an, en, in) khác -ng (ang, eng, ing)' };
    if ((ti === 'n' || ti === 'l') && (pair(tf, gf, 'v', 'u') || pair(tf, gf, 've', 'ue')))
      return { key: 'ü', tip: 'sau n, l: ü gõ bằng phím v (女 nv, 绿 lv)' };
  }
  return { key: 'âm khác', tip: `âm đúng là ${target}` };
}

// ---------------------------------------------------------------- chấm

/** đúng, chọn nhầm chữ cùng âm, gõ sai âm, sai dấu câu (，thay cho 、…), thiếu, thừa */
export type CellKind = 'ok' | 'dong-am' | 'sai-am' | 'dau-cau' | 'thieu' | 'thua';
export interface Cell {
  kind: CellKind;
  /** chữ đúng (không có khi gõ thừa) */
  t?: string;
  syl?: string;
  /** chữ đã gõ (không có khi thiếu) */
  got?: string;
  gotSyl?: string;
  hint?: SylHint;
}
export interface CheckResult {
  cells: Cell[];
  /** số chữ đúng (đúng vị trí) */
  right: number;
  total: number;
  ok: boolean;
}

/** Giá thay một chữ bằng chữ khác: chữ Hán thay cho dấu câu (hay ngược lại) đắt gấp đôi, coi như thiếu một, thừa một. */
const subCost = (x: string, y: string) => (x === y ? 0 : isZhPunct(x) !== isZhPunct(y) ? 2 : 1);

/** Bảng khoảng cách sửa (Levenshtein) giữa chữ đích a và chữ đã gõ b. */
function editTable(a: readonly TargetChar[], b: readonly TypedChar[]): number[][] {
  const n = a.length;
  const m = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j - 1] + subCost(a[i - 1].c, b[j - 1].c), d[i - 1][j] + 1, d[i][j - 1] + 1);
  return d;
}

/**
 * Chấm chữ đã gõ so với chữ đích: chỉ tính chữ Hán (bỏ dấu câu), hoặc cả dấu câu tiếng Trung nếu `o.punct`. Căn hai
 * chuỗi (ít sửa nhất): chữ thay bằng chữ cùng âm là chọn nhầm, khác âm là gõ sai âm (kèm mẹo), dấu thay bằng dấu khác
 * là sai dấu câu.
 */
export function checkTyped(target: readonly TargetChar[], typed: readonly TypedChar[], lex?: Pick<ImeLexicon, 'charSyl'>, o?: CheckOpts): CheckResult {
  const scored = scoredBy(o);
  const a = target.filter((x) => scored(x.c));
  const b = typed.filter((x) => scored(x.c));
  const cells = traceback(editTable(a, b), a, b, a.length, lex);
  const right = cells.filter((c) => c.kind === 'ok').length;
  return { cells, right, total: a.length, ok: right === a.length && cells.length === a.length };
}

/** Kết quả chấm phần đã gõ của một câu đang gõ dở. */
export interface PrefixResult extends CheckResult {
  /** số chữ đầu của câu đích đã được căn với phần đã gõ: chữ thứ `next` là chữ cần gõ tiếp */
  next: number;
}

/**
 * Chấm phần đã gõ của một câu đang gõ dở (gõ theo đoạn văn, chấm ngay khi gõ): căn chữ đã gõ với phần đầu của câu
 * đích, phần sau chưa gõ không tính là thiếu. Hoà điểm thì chọn cách căn đi xa hơn trong câu đích: chọn nhầm chữ cuối là
 * chọn nhầm (không phải gõ thừa), bỏ sót một chữ là thiếu chữ đó (không phải sai cả đoạn sau). `ok`: đã gõ đúng hết câu.
 */
export function checkPrefix(target: readonly TargetChar[], typed: readonly TypedChar[], lex?: Pick<ImeLexicon, 'charSyl'>, o?: CheckOpts): PrefixResult {
  const scored = scoredBy(o);
  const a = target.filter((x) => scored(x.c));
  const b = typed.filter((x) => scored(x.c));
  const d = editTable(a, b);
  const m = b.length;
  let next = 0;
  for (let i = 0; i <= a.length; i++) if (d[i][m] <= d[next][m]) next = i;
  const cells = traceback(d, a, b, next, lex);
  const right = cells.filter((c) => c.kind === 'ok').length;
  return { cells, right, total: a.length, ok: next === a.length && right === a.length && cells.length === a.length, next };
}

/**
 * Đi ngược bảng sửa từ ô (i0, hết chuỗi gõ) ra các ô kết quả: đúng, chọn nhầm, sai âm, thiếu, thừa. Nhiều cách căn
 * cùng điểm thì: chữ gõ cùng âm với chữ đích là chọn nhầm chữ đó (我是在家 gõ 我再家: thiếu 是, chọn nhầm 再 cho 在);
 * còn lại thì để chỗ thiếu, chỗ thừa về sau (chữ gõ trước ứng với chữ đích đứng trước, theo thứ tự đọc): sót 天气 trong
 * 今天天气 là thiếu hai chữ liền nhau; gõ 在 hai lần thì chữ sau là thừa.
 */
function traceback(d: number[][], a: readonly TargetChar[], b: readonly TypedChar[], i0: number, lex?: Pick<ImeLexicon, 'charSyl'>): Cell[] {
  const sylsOf = (g: TypedChar) => (g.syl ? [g.syl] : [...(lex?.charSyl.get(g.c) ?? [])]);
  const cells: Cell[] = [];
  let i = i0;
  let j = b.length;
  while (i > 0 || j > 0) {
    const t = a[i - 1];
    const g = b[j - 1];
    const diag = i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + subCost(t.c, g.c);
    const homophone = diag && t.c !== g.c && !!t.syl && sylsOf(g).includes(t.syl);
    if (!homophone && i > 0 && d[i][j] === d[i - 1][j] + 1) {
      cells.push({ kind: 'thieu', t: t.c, syl: t.syl });
      i--;
    } else if (!homophone && j > 0 && d[i][j] === d[i][j - 1] + 1) {
      cells.push({ kind: 'thua', got: g.c, gotSyl: g.syl });
      j--;
    } else if (diag) {
      if (t.c === g.c) cells.push({ kind: 'ok', t: t.c, syl: t.syl, got: g.c });
      else if (isZhPunct(t.c)) cells.push({ kind: 'dau-cau', t: t.c, got: g.c });
      else {
        const gotSyls = sylsOf(g);
        const gotSyl = homophone ? t.syl : gotSyls[0];
        cells.push({
          kind: homophone ? 'dong-am' : 'sai-am',
          t: t.c,
          syl: t.syl,
          got: g.c,
          gotSyl,
          ...(!homophone && t.syl && gotSyl ? { hint: sylHint(t.syl, gotSyl) } : {}),
        });
      }
      i--;
      j--;
    } else break; // không xảy ra: bảng sửa luôn có một bước đi ngược hợp lệ
  }
  return cells.reverse();
}

/** Dấu lỗi trên chính các chữ đã gõ (để sửa tại chỗ): vị trí tính theo mảng chữ đã gõ, kể cả dấu câu. */
export interface TypedMarks {
  /** chữ chọn nhầm hoặc gõ sai âm */
  bad: Set<number>;
  /** chữ gõ thừa */
  extra: Set<number>;
  /** chỗ thiếu chữ: trước chữ thứ i (i bằng số chữ đã gõ: ở cuối) → số chữ thiếu */
  gaps: Map<number, number>;
}

/** Đổi kết quả chấm (các ô theo thứ tự) thành dấu trên các chữ đã gõ (cùng tuỳ chọn chấm với lúc chấm). */
export function marksOf(cells: readonly Cell[], typed: readonly TypedChar[], o?: CheckOpts): TypedMarks {
  const scored = scoredBy(o);
  const han = typed.flatMap((x, i) => (scored(x.c) ? [i] : []));
  const marks: TypedMarks = { bad: new Set(), extra: new Set(), gaps: new Map() };
  let j = 0;
  let last = -1;
  for (const c of cells) {
    if (c.kind === 'thieu') {
      marks.gaps.set(last + 1, (marks.gaps.get(last + 1) ?? 0) + 1);
      continue;
    }
    const at = han[j++];
    if (at === undefined) continue;
    last = at;
    if (c.kind === 'dong-am' || c.kind === 'sai-am' || c.kind === 'dau-cau') marks.bad.add(at);
    else if (c.kind === 'thua') marks.extra.add(at);
  }
  return marks;
}

// ---------------------------------------------------------------- bộ từ cùng âm

export interface HomoMember {
  t: string;
  id: string;
  p: string;
  hv: string;
  m: string;
  lv: number;
  rank: number;
}

/**
 * Các bộ từ HSK (cấp ≤ maxLevel) gõ cùng một chuỗi pinyin (không dấu thanh) nên dễ chọn nhầm: 在/再 (zai),
 * 买/卖 (mai), 的/得/地 (de)… Bộ hay gặp trước.
 */
export function homophoneSets(rows: Iterable<SearchRowLike>, maxLevel: number): HomoMember[][] {
  const groups = new Map<string, HomoMember[]>();
  for (const r of rows) {
    const [id, lv, p, hv, vi] = r;
    if (lv < 1 || lv > maxLevel) continue;
    const t = id.slice(0, id.indexOf('_'));
    if (![...t].every(isHan)) continue;
    const syl = sylOfId(id);
    if (syl.length !== [...t].length) continue;
    const key = syl.join("'");
    const list = groups.get(key) ?? [];
    if (!list.some((x) => x.t === t)) list.push({ t, id, p, hv, m: vi.split(/\s*;\s*/)[0] ?? '', lv, rank: r[6] ?? 30000 });
    groups.set(key, list);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort((x, y) => x.rank - y.rank))
    .sort((x, y) => x[0].rank + x[1].rank - (y[0].rank + y[1].rank));
}

// ---------------------------------------------------------------- tổng hợp lỗi

export interface TypingError {
  kind: Exclude<CellKind, 'ok'>;
  t?: string;
  got?: string;
  key?: string;
}

export interface ErrorSummary {
  /** chọn nhầm chữ cùng âm: "在→再" và số lần */
  swaps: { t: string; got: string; n: number }[];
  /** lỗi dấu câu: cần dấu `t`, gõ `got` ('' là bỏ sót dấu, `t` '' là thừa dấu) */
  puncts: { t: string; got: string; n: number }[];
  /** nhóm lỗi âm: "zh/z", "-n/-ng"… */
  sounds: { key: string; n: number }[];
  /** chữ hay sai nhất */
  chars: { t: string; n: number }[];
}

export function summarizeErrors(errors: readonly TypingError[], top = 5): ErrorSummary {
  const count = <K>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  };
  return {
    swaps: count(errors.filter((e) => e.kind === 'dong-am' && e.t && e.got).map((e) => `${e.t}→${e.got}`)).map(([k, n]) => {
      const [t, got] = k.split('→');
      return { t, got, n };
    }),
    puncts: count(
      errors
        .filter((e) => e.kind === 'dau-cau' || (e.kind === 'thieu' && e.t && isZhPunct(e.t)) || (e.kind === 'thua' && e.got && isZhPunct(e.got)))
        .map((e) => `${e.kind === 'thua' ? '' : (e.t ?? '')}→${e.kind === 'thieu' ? '' : (e.got ?? '')}`),
    ).map(([k, n]) => {
      const [t, got] = k.split('→');
      return { t, got, n };
    }),
    sounds: count(errors.filter((e) => e.kind === 'sai-am' && e.key && e.key !== 'âm khác').map((e) => e.key!)).map(([key, n]) => ({ key, n })),
    chars: count(errors.filter((e) => e.t && e.kind !== 'thua' && isHan(e.t)).map((e) => e.t!)).map(([t, n]) => ({ t, n })),
  };
}

/** Lời giải thích một lỗi dấu câu: cần dấu `t` (bỏ trống: thừa dấu), gõ `got` (bỏ trống: thiếu dấu). */
export function punctTip(t: string | undefined, got: string | undefined): string {
  const key = (c: string) => {
    const k = punctInfo(c)?.key;
    return k ? ` (phím ${k === '(' ? 'Shift + 9' : k === ')' ? 'Shift + 0' : k})` : '';
  };
  const name = (c: string) => punctInfo(c)?.name ?? 'dấu';
  if (t === '、' && got === '，')
    return 'Các từ, cụm từ ngắn ngang hàng trong một danh sách (A、B和C) ngăn bằng dấu ngắt liệt kê 、 (phím \\), không dùng dấu phẩy ， ở đây.';
  if (t === '，' && got === '、')
    return 'Chỗ này cần dấu phẩy ， (phím ,): chỗ ngừng trong câu (giữa hai vế, sau lời gọi, sau phần mở đầu câu, giữa các nhóm dài khi liệt kê). Dấu 、 chỉ ngăn các từ, cụm từ ngắn ngang hàng.';
  if (t && !got) return `Thiếu ${name(t)} ${punctShown(t)}${key(t)}.${t === '、' ? ' Khi liệt kê, giữa các món là dấu ngắt liệt kê.' : ''}`;
  if (!t && got) return `Chỗ này không có dấu ${punctShown(got)}, xoá đi.`;
  if (t === '。') return `Bạn gõ ${punctShown(got ?? '')} nhưng câu này kết thúc bằng dấu chấm tròn 。${key('。')}.`;
  return `Bạn gõ ${punctShown(got ?? '')} nhưng chỗ này cần ${name(t ?? '')} ${punctShown(t ?? '')}${key(t ?? '')}.`;
}

// ---------------------------------------------------------------- bẫy dấu câu

/** Từ loại của một từ theo id (theo dữ liệu từ HSK: 名, 动, 形, 代…); không có trong dữ liệu thì mảng rỗng. */
export type PosOf = (id: string) => readonly string[];
const NOMINAL = ['名', '数', '量', '数量', '代', '后缀'];

/**
 * Chỗ trống ở dấu `tk[i]` (、 hoặc ，) có dùng làm đề Bẫy dấu câu được không. Bỏ những chỗ mà dấu kia cũng chấp nhận
 * được (người học điền dấu kia mà bị chấm sai):
 * - ， giữa hai cụm danh từ trơn (bên phải không có động từ, tính từ, không mở đầu bằng đại từ, hết ở ，。 hoặc hết câu;
 *   bên trái kết thúc bằng danh từ, số, lượng từ, đại từ, tên riêng): trông như liệt kê (一个五块，两个八块);
 * - ， nối tiếp một chuỗi 、 (đoạn bên trái mở đầu bằng 、) mà bên phải là cụm danh từ hoặc lại hết ở ，;
 * - 、 giữa hai cụm động từ (bên phải mở đầu bằng động từ, từ hai từ trở lên, phía sau trong câu không có 都, 也, 的):
 *   ， cũng được (洗米、做米饭).
 * Từ không rõ từ loại (ngoài dữ liệu) tính như động từ, tính từ.
 */
export function blankOk(tk: readonly Token[], i: number, posOf: PosOf): boolean {
  const mark = tk[i]?.[0];
  if (tk[i]?.length !== 1 || (mark !== '、' && mark !== '，')) return false;
  const pos = (t: Token) => (t.length === 3 ? posOf(t[2]) : []);
  const isPunct = (t: Token) => t.length === 1;
  const isPred = (t: Token) => t.length === 3 && (pos(t).length === 0 || (pos(t).some((p) => p === '动' || p === '形') && !pos(t).includes('连')));
  const isPron = (t: Token) => t.length === 3 && pos(t).includes('代');
  const isNom = (t: Token) => t.length === 2 || (t.length === 3 && pos(t).some((p) => NOMINAL.includes(p)));
  /** các từ giữa chỗ trống và dấu câu gần nhất theo hướng d, và dấu đó ('' nếu hết câu) */
  const seg = (d: 1 | -1) => {
    const w: Token[] = [];
    let j = i + d;
    for (; j >= 0 && j < tk.length && !isPunct(tk[j]); j += d) w.push(tk[j]);
    return { w: d < 0 ? w.reverse() : w, b: j >= 0 && j < tk.length ? tk[j][0] : '' };
  };
  const L = seg(-1);
  const R = seg(1);
  if (mark === '，') {
    const bareNouns = R.w.length > 0 && !R.w.some(isPred) && !isPron(R.w[0]) && ['，', '。', ''].includes(R.b) && L.w.length > 0 && isNom(L.w[L.w.length - 1]);
    const afterList = L.b === '、' && (!R.w.some(isPred) || R.b === '，');
    return !bareNouns && !afterList;
  }
  if (R.w.length < 2 || !isPred(R.w[0]) || isNom(R.w[0])) return true;
  let j = i + 1;
  while (j < tk.length && !(isPunct(tk[j]) && /[。！？]/.test(tk[j][0]))) j++;
  return tk.slice(i + 1, j).some((t) => ['都', '也', '的'].includes(t[0]));
}

/** Số chữ mỗi phút. */
export const perMinute = (chars: number, ms: number) => (ms > 0 ? Math.round((chars * 60_000) / ms) : 0);

// ---------------------------------------------------------------- tích luỹ lượt luyện gõ

/** Thời gian tối đa tính cho một đề (người học bỏ dở rồi quay lại không làm phồng số liệu). */
export const FIRST_CHECK_MAX_MS = 5 * 60_000;

/** Bộ tích luỹ kết quả lượt luyện gõ (chỉ tính lần chấm đầu của mỗi đề). */
export interface DrillScore {
  right: number;
  chars: number;
  ms: number;
  errors: TypingError[];
}

/**
 * Cộng kết quả lần chấm đầu của một đề vào bộ tích luỹ: số chữ đúng, tổng số chữ, thời gian (trần
 * FIRST_CHECK_MAX_MS), các lỗi theo ô; `missed` cho biết đề này sai để giữ vào danh sách gõ lại.
 * Thuần: trả bộ mới, không sửa `prev`.
 */
export function scoreFirstCheck(prev: DrillScore, r: CheckResult, now: number, startedAt: number): { score: DrillScore; missed: boolean } {
  const score: DrillScore = {
    right: prev.right + r.right,
    chars: prev.chars + r.total,
    ms: prev.ms + Math.min(FIRST_CHECK_MAX_MS, now - startedAt),
    errors: prev.errors.concat(
      r.cells.flatMap((c) => (c.kind === 'ok' ? [] : [{ kind: c.kind, t: c.t, got: c.got, key: c.hint?.key }])),
    ),
  };
  return { score, missed: !r.ok };
}
