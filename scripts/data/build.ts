/**
 * Bước join: dựng tập từ, gắn nghĩa, phồn thể, Hán Việt; dựng tập chữ.
 */
import {
  alignMarked,
  splitMarked,
  sylsToDisplay,
  sylsToKey,
  type Syl,
  type Tone,
} from '../../src/lib/pinyin.ts';
import type { CharRec, WordRec } from '../../src/schema/data.ts';
import type {
  ChvForm,
  DictLine,
  HanvietRow,
  Hsk20Word,
  KrmanikRow,
  MmahEntry,
  Std21Char,
  Std21Word,
  SyllabusWordRow,
} from './parse.ts';

const HAN = /^\p{Script=Han}$/u;
export const isHan = (c: string) => HAN.test(c);
export const allHan = (s: string) => [...s].every(isHan);

export interface Issue {
  kind: string;
  detail: string;
}
export class Issues {
  list: Issue[] = [];
  add(kind: string, detail: string) {
    this.list.push({ kind, detail });
  }
  count(kind: string) {
    return this.list.filter((i) => i.kind === kind).length;
  }
  byKind(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const i of this.list) out[i.kind] = (out[i.kind] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort());
  }
}

/** Bản ghi từ trong lúc dựng (trước khi xuất ra WordRec). */
export interface WordDraft {
  id: string;
  s: string;
  syls: Syl[];
  p: string;
  lv: { e25?: number; s21?: number; h20?: number };
  also: Set<number>;
  pos: string[];
  /** Nguồn có mục này: h = harukicoder, k = krmanik, s21, h20 */
  src: Set<string>;
  /** Các nhóm dạng phồn thể gợi ý, theo thứ tự ưu tiên (chuẩn 2021 → HSK 2.0); một nhóm có thể nhiều dạng (台|臺). */
  tHints: string[][];
  t?: string;
  vi?: string[];
  en?: string[];
  cl?: string[];
  hv?: (string[] | null)[];
  hva?: number[];
}

/** Bỏ biến điệu của 一 và 不 trong pinyin đề cương: yíxià → yi1 xia4, bú kèqi → bu4 ke4 qi5. */
export function desandhi(s: string, syls: Syl[]): Syl[] {
  const cs = [...s];
  return syls.map((y, i) => {
    if (cs[i] === '一' && y.base === 'yi' && (y.tone === 2 || y.tone === 4)) return { base: y.base, tone: 1 as Tone };
    if (cs[i] === '不' && y.base === 'bu' && y.tone === 2) return { base: y.base, tone: 4 as Tone };
    return y;
  });
}

/** Pinyin hiển thị: dấu nháy kiểu chữ in (’), bỏ khoảng trắng thừa. */
function cleanDisplay(p: string): string {
  return p.replace(/'/g, '’').replace(/\s+/g, ' ').trim();
}

export type SplitHow = 'strict' | 'dict' | 'lenient';

/**
 * Tách pinyin dạng dấu của một từ theo số chữ; chọn cách đọc đầu nếu có "/".
 * Thứ tự: cách tách theo một cách đọc có trong từ điển (`candidates`) → tách theo quy tắc chính tả
 * → tách nới lỏng (nguồn quên dấu nháy, ví dụ "téngài").
 */
export function wordSyls(s: string, pinyin: string, candidates: Syl[][] = []): { syls: Syl[]; display: string; how: SplitHow } | null {
  const first = pinyin.split('/')[0].trim();
  const cs = [...s];
  const n = cs.length;
  const strict = splitMarked(first, n);
  const fromDict = (() => {
    for (const c of candidates) {
      if (c.length !== n) continue;
      const a = alignMarked(first, c.map((y) => y.base));
      if (a) return a;
    }
    return null;
  })();
  let raw = strict;
  let how: SplitHow = 'strict';
  if (fromDict && (!strict || strict.some((y, i) => y.base !== fromDict[i].base))) {
    raw = fromDict;
    how = 'dict';
  }
  if (!raw) {
    raw = splitMarked(first, n, { lenient: true });
    how = 'lenient';
  }
  if (!raw) return null;
  // 儿 hoá viết "er" ở cuối (ví dụ "mòshuǐer") → âm r
  const syls = raw.map(({ base, tone }, i) =>
    cs[i] === '儿' && i > 0 && base === 'er' && tone === 5 ? { base: 'r', tone: 5 as Tone } : { base, tone },
  );
  return { syls: desandhi(s, syls), display: cleanDisplay(first), how };
}

const sameBases = (a: Syl[], b: Syl[]) => a.length === b.length && a.every((y, i) => y.base === b[i].base);
const tonesCompatible = (a: Syl[], b: Syl[]) =>
  sameBases(a, b) && a.every((y, i) => y.tone === b[i].tone || y.tone === 5 || b[i].tone === 5);

export class WordSet {
  readonly byId = new Map<string, WordDraft>();
  readonly bySimp = new Map<string, WordDraft[]>();
  /**
   * @param readings các cách đọc của một chuỗi theo từ điển (CVDICT, complete-hsk-vocabulary, chuẩn 2021),
   *   dùng để tách âm tiết và để xác nhận mục bổ sung từ krmanik.
   * @param pinyinFixes chữ Hán → pinyin dạng dấu đúng (content/pinyin-fixes.yaml), ghi đè pinyin
   *   sai của nguồn đề cương trước khi sinh wordId.
   */
  constructor(
    private issues: Issues,
    private readings: (s: string) => Syl[][] = () => [],
    private pinyinFixes: ReadonlyMap<string, string> = new Map(),
  ) {}

  private index(w: WordDraft) {
    this.byId.set(w.id, w);
    const list = this.bySimp.get(w.s) ?? [];
    list.push(w);
    this.bySimp.set(w.s, list);
  }

  /** Thêm một mục của đề cương 2025 (harukicoder `h` hoặc krmanik `k`). */
  add2025(row: SyllabusWordRow | KrmanikRow, src: 'h' | 'k') {
    if (!allHan(row.s)) {
      this.issues.add(src === 'h' ? 'error:e25-khong-phai-chu-han' : 'warn:k-khong-phai-chu-han', row.s);
      return;
    }
    const known = this.readings(row.s);
    const fixedPinyin = this.pinyinFixes.get(row.s);
    if (fixedPinyin !== undefined && fixedPinyin !== row.pinyin) {
      this.issues.add('info:pinyin-fix', `${row.s}: ${row.pinyin} → ${fixedPinyin} (${src})`);
    }
    const parsed = wordSyls(row.s, fixedPinyin ?? row.pinyin, known);
    if (!parsed) {
      this.issues.add(src === 'h' ? 'error:e25-khong-tach-duoc-pinyin' : 'warn:k-khong-tach-duoc-pinyin', `${row.s} ${row.pinyin}`);
      return;
    }
    if (parsed.how !== 'strict') this.issues.add(`info:tach-am-${parsed.how}`, `${row.s} ${row.pinyin} → ${sylsToKey(parsed.syls)}`);
    if (row.pinyin.includes('/')) this.issues.add('info:nhieu-cach-doc-lay-cach-dau', `${row.s} ${row.pinyin}`);
    const id = `${row.s}_${sylsToKey(parsed.syls)}`;
    const existing = this.byId.get(id);
    if (!existing && src === 'k' && !known.some((k) => tonesCompatible(k, parsed.syls))) {
      // Mục chỉ có ở krmanik phải là một cách đọc có trong từ điển (tránh lỗi gõ như 线上 "xiàshàng").
      this.issues.add('warn:k-bo-qua-khong-co-trong-tu-dien', `${row.s} ${row.pinyin} L${row.level}`);
      return;
    }
    if (!existing) {
      this.index({
        id,
        s: row.s,
        syls: parsed.syls,
        p: parsed.display,
        lv: { e25: row.level },
        also: new Set(row.also),
        pos: [...row.pos],
        src: new Set([src]),
        tHints: [],
      });
      if (src === 'k') this.issues.add('info:k-bo-sung-muc-dong-tu', `${id} L${row.level}`);
      return;
    }
    const prev = existing.lv.e25;
    if (prev === undefined || row.level < prev) {
      if (prev !== undefined) existing.also.add(prev);
      existing.lv.e25 = row.level;
    } else if (row.level > prev) existing.also.add(row.level);
    for (const a of row.also) existing.also.add(a);
    for (const p of row.pos) if (!existing.pos.includes(p)) existing.pos.push(p);
    if (src === 'h' && !existing.src.has('h')) existing.p = parsed.display;
    existing.src.add(src);
  }

  /** Gắn cấp chuẩn 2021 hoặc HSK 2.0; tạo từ mới nếu chưa có. */
  attach(std: 's21' | 'h20', s: string, syls: Syl[], level: number, tHint?: string) {
    const id = `${s}_${sylsToKey(syls)}`;
    let w = this.byId.get(id);
    if (!w) {
      const cands = (this.bySimp.get(s) ?? []).filter((c) => sameBases(c.syls, syls));
      if (cands.length === 1) w = cands[0];
      else if (cands.length > 1) w = cands.find((c) => tonesCompatible(c.syls, syls));
    }
    if (!w) {
      w = {
        id,
        s,
        syls,
        p: sylsToDisplay(syls),
        lv: {},
        also: new Set(),
        pos: [],
        src: new Set(),
        tHints: [],
      };
      this.index(w);
    }
    const cur = w.lv[std];
    w.lv[std] = cur === undefined ? level : Math.min(cur, level);
    w.src.add(std);
    if (tHint) {
      const n = [...s].length;
      const group = tHint.split('|').map((x) => x.trim()).filter((x) => [...x].length === n);
      if (group.length && !w.tHints.some((g) => g.join('|') === group.join('|'))) w.tHints.push(group);
    }
  }

  addStd21(rows: Std21Word[], parseNum: (p: string) => Syl[] | null) {
    for (const r of rows) {
      if (!allHan(r.s)) {
        this.issues.add('warn:s21-khong-phai-chu-han', r.s);
        continue;
      }
      const n = [...r.s].length;
      let syls = r.numbered ? parseNum(r.numbered) : null;
      if (syls && syls.length !== n) syls = null;
      if (!syls) syls = wordSyls(r.s, r.marked, this.readings(r.s))?.syls ?? null;
      if (!syls) {
        this.issues.add('warn:s21-khong-tach-duoc-pinyin', `${r.s} ${r.numbered ?? r.marked}`);
        continue;
      }
      this.attach('s21', r.s, syls, r.level, r.t);
    }
  }

  addHsk20(rows: Hsk20Word[]) {
    for (const r of rows) {
      if (!allHan(r.s)) {
        this.issues.add('warn:h20-khong-phai-chu-han', r.s);
        continue;
      }
      const n = [...r.s].length;
      // Một dòng có thể ghi nhiều cách đọc: "cháng, zhǎng" → hai mục.
      const markedAlts = r.marked.split(/\s*[,，]\s*/).filter(Boolean);
      const alts: Syl[][] = [];
      if (r.syls && r.syls.length === n) alts.push(r.syls);
      else
        for (const m of markedAlts) {
          const p = wordSyls(r.s, m, this.readings(r.s));
          if (p) alts.push(p.syls);
        }
      if (!alts.length) {
        this.issues.add('warn:h20-khong-tach-duoc-pinyin', `${r.s} ${r.marked}`);
        continue;
      }
      for (const syls of alts) this.attach('h20', r.s, syls, r.level, r.t);
    }
  }

  all(): WordDraft[] {
    return [...this.byId.values()];
  }
}

// ------------------------------------------------------------------ nghĩa, phồn thể

const VARIANT_GLOSS = /^(biến thể|dạng (cũ|cổ) của|cũng viết là|variant of|old variant of|archaic variant of|erhua variant of|see )/i;
const isVariantOnly = (g: string[]) => g.length > 0 && g.every((x) => VARIANT_GLOSS.test(x));
const REF = /([^\s[\]/,;()（）|]+)\[([^\]]+)\]/;

/** Chọn các mục từ điển khớp từ: khớp đủ thanh → khớp bỏ qua thanh nhẹ → khớp không thanh. Ưu tiên mục chữ thường. */
export function matchEntries<T extends { syls: Syl[] | null; cap: boolean }>(w: { s: string; syls: Syl[] }, cands: T[]): T[] {
  const ok = cands.filter((c): c is T & { syls: Syl[] } => !!c.syls && c.syls.length === w.syls.length);
  const key = sylsToKey(w.syls);
  const tiers = [
    ok.filter((c) => sylsToKey(c.syls) === key),
    ok.filter((c) => tonesCompatible(c.syls, w.syls)),
    ok.filter((c) => sameBases(c.syls, w.syls)),
  ];
  for (const tier of tiers) {
    if (!tier.length) continue;
    const lower = tier.filter((c) => !c.cap);
    return lower.length ? lower : tier;
  }
  return [];
}

export interface GlossSources {
  cvdict: Map<string, DictLine[]>;
  chv: Map<string, ChvForm[]>;
  hsk20En: Map<string, { syls: Syl[] | null; en: string }[]>;
}

/** Nghĩa của mục chỉ ghi "biến thể của X[py]": lấy nghĩa của X. */
function resolveVariant(m: DictLine, cvdict: Map<string, DictLine[]>): string[] {
  for (const g of m.glosses) {
    const ref = REF.exec(g);
    if (!ref) continue;
    const target = (cvdict.get(ref[1]) ?? []).filter((d) => d.pinyin.toLowerCase() === ref[2].toLowerCase() && !isVariantOnly(d.glosses));
    if (target.length) return target.flatMap((d) => d.glosses);
  }
  return [];
}

type ViPick = { vi: string[]; cl: string[]; t?: string; how: 'am' | 'khac-am' | 'bo-er' };

/** Bỏ các nghĩa chỉ là tham chiếu biến thể ("biến thể của X", "variant of X") nếu còn nghĩa khác. */
export function dropVariantGlosses(list: string[]): string[] {
  const real = list.filter((g) => !VARIANT_GLOSS.test(g));
  return real.length ? real : list;
}

/**
 * Nghĩa tiếng Việt của một từ từ CVDICT.
 * @param hints các dạng phồn thể đã biết (chuẩn 2021, complete-hsk-vocabulary) để chọn đúng mục khi một
 *   chữ giản thể ứng với nhiều chữ phồn thể (只 zhī: 隻 chứ không phải 秖).
 */
function pickVi(s: string, syls: Syl[], cvdict: Map<string, DictLine[]>, hints: string[][] = []): ViPick | null {
  const all = cvdict.get(s) ?? [];
  const collect = (entries: DictLine[]) => {
    let main = entries.filter((m) => !isVariantOnly(m.glosses));
    // Nhóm gợi ý phồn thể đầu tiên có mục khớp (chuẩn 2021 trước); trong nhóm, mục nhiều nghĩa hơn đứng trước.
    const hinted = hints.map((g) => main.filter((m) => g.includes(m.t))).find((x) => x.length);
    main = (hinted ?? main).map((m, i) => ({ m, i })).sort((a, b) => b.m.glosses.length - a.m.glosses.length || a.i - b.i).map((x) => x.m);
    const vi: string[] = [];
    const cl: string[] = [];
    for (const m of main.length ? main : entries) {
      const gl = main.length ? m.glosses : resolveVariant(m, cvdict);
      for (const g of gl) if (!vi.includes(g)) vi.push(g);
      for (const c of m.cl) if (!cl.includes(c)) cl.push(c);
    }
    return { vi: dropVariantGlosses(vi), cl, t: (main[0] ?? entries[0])?.t };
  };
  // 1–3: khớp cách đọc
  const matched = matchEntries({ s, syls }, all);
  if (matched.length) {
    const r = collect(matched);
    if (r.vi.length) return { ...r, how: 'am' };
  }
  // 4: cùng chữ, cùng số âm tiết, cách đọc khác (nguồn ghi âm khác: 泄露 xièlòu ↔ xie4 lu4)
  const sameLen = all.filter((d) => d.syls?.length === syls.length);
  const lower = sameLen.filter((d) => !d.cap);
  if (sameLen.length) {
    const r = collect(lower.length ? lower : sameLen);
    if (r.vi.length) return { vi: r.vi, cl: r.cl, how: 'khac-am' };
  }
  // 5: từ 儿 hoá → nghĩa của từ gốc (口哨儿 → 口哨)
  const cs = [...s];
  if (cs.length > 1 && cs[cs.length - 1] === '儿' && syls[syls.length - 1]?.base === 'r') {
    const base = pickVi(cs.slice(0, -1).join(''), syls.slice(0, -1), cvdict, hints.map((g) => g.map((h) => [...h].slice(0, -1).join(''))));
    if (base) return { vi: base.vi, cl: base.cl, how: 'bo-er' };
  }
  return null;
}

export function attachGlosses(words: WordDraft[], src: GlossSources, issues: Issues) {
  for (const w of words) {
    const forms = matchEntries(w, src.chv.get(w.s) ?? []);
    // Tiếng Việt + phồn thể + lượng từ (CVDICT)
    const hints = [...w.tHints, forms.map((f) => f.t)];
    const pick = pickVi(w.s, w.syls, src.cvdict, hints);
    if (pick) {
      if (pick.vi.length) w.vi = pick.vi;
      if (pick.cl.length) w.cl = pick.cl;
      if (pick.how === 'am' && pick.t) w.t = pick.t;
      if (pick.how !== 'am' && w.lv.e25 !== undefined) issues.add(`info:nghia-viet-${pick.how}`, w.id);
    }
    // Tiếng Anh
    const hintedForms = forms.filter((f) => w.t && f.t === w.t);
    let en: string[] = [];
    for (const f of hintedForms.length ? hintedForms : forms) for (const m of f.meanings) if (!en.includes(m)) en.push(m);
    if (!en.length) {
      const h = (src.hsk20En.get(w.s) ?? []).find((x) => x.syls && sameBases(x.syls, w.syls));
      if (h?.en) en.push(...h.en.split(/\s*[;|]\s*/).filter(Boolean));
    }
    en = dropVariantGlosses(en);
    if (en.length) w.en = en;
    if (!w.cl?.length) {
      const fcl = forms.flatMap((f) => f.classifiers);
      if (fcl.length) w.cl = [...new Set(fcl)];
    }
    if (!w.t) {
      const ft = forms.find((f) => [...f.t].length === [...w.s].length)?.t;
      w.t = w.tHints[0]?.[0] ?? ft;
    }
    if (!w.vi && w.lv.e25 !== undefined) issues.add(`warn:thieu-nghia-viet-L${w.lv.e25}`, w.id);
  }
}

/** Phồn thể theo từng chữ cho từ chưa có phồn thể: lấy cặp (giản, phồn) phổ biến nhất trong các từ đã có. */
export function fillTraditional(words: WordDraft[], issues: Issues) {
  const pairCount = new Map<string, Map<string, number>>();
  for (const w of words) {
    if (!w.t) continue;
    const cs = [...w.s];
    const ts = [...w.t];
    if (cs.length !== ts.length) continue;
    cs.forEach((c, i) => {
      const m = pairCount.get(c) ?? new Map<string, number>();
      m.set(ts[i], (m.get(ts[i]) ?? 0) + 1);
      pairCount.set(c, m);
    });
  }
  const best = (c: string) => {
    const m = pairCount.get(c);
    if (!m) return c;
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  for (const w of words) {
    if (w.t && [...w.t].length === [...w.s].length) continue;
    w.t = [...w.s].map(best).join('');
    issues.add('info:phon-the-ghep-tung-chu', w.id);
  }
  return pairCount;
}

// ------------------------------------------------------------------ Hán Việt

export class HanvietIndex {
  /** `${chữ}|${âm tiết số}` → cách đọc */
  readonly exact = new Map<string, string[]>();
  /** chữ → cách đọc không gắn pinyin (*) */
  readonly star = new Map<string, string[]>();
  /** chữ → mọi cách đọc (theo thứ tự xuất hiện) */
  readonly any = new Map<string, string[]>();
  /** chữ → các dòng (để dựng bản ghi chữ) */
  readonly rows = new Map<string, HanvietRow[]>();

  constructor(rows: HanvietRow[]) {
    const push = (m: Map<string, string[]>, k: string, vals: string[]) => {
      const cur = m.get(k) ?? [];
      for (const v of vals) if (!cur.includes(v)) cur.push(v);
      m.set(k, cur);
    };
    for (const r of rows) {
      if (!r.readings.length) continue;
      if (r.key === '*') push(this.star, r.c, r.readings);
      else push(this.exact, `${r.c}|${r.key}`, r.readings);
      push(this.any, r.c, r.readings);
      this.rows.set(r.c, [...(this.rows.get(r.c) ?? []), r]);
    }
  }

  /** Âm Hán Việt của một âm tiết: trả `[cách đọc, gần đúng?]`. */
  lookup(trad: string, simp: string, syl: Syl): [string[], boolean] | null {
    const cands = trad === simp ? [trad] : [trad, simp];
    for (const c of cands) {
      const r = this.exact.get(`${c}|${syl.base}${syl.tone}`);
      if (r) return [r, false];
    }
    if (syl.tone === 5) {
      for (const c of cands) {
        const all: string[] = [];
        for (const t of [1, 2, 3, 4]) for (const v of this.exact.get(`${c}|${syl.base}${t}`) ?? []) if (!all.includes(v)) all.push(v);
        if (all.length) return [all, false];
      }
    }
    for (const c of cands) {
      const r = this.star.get(c);
      if (r) return [r, false];
    }
    for (const c of cands) {
      const r = this.any.get(c);
      if (r) return [r, true];
    }
    return null;
  }
}

export function attachHanviet(words: WordDraft[], hv: HanvietIndex, issues: Issues) {
  for (const w of words) {
    const cs = [...w.s];
    const ts = w.t ? [...w.t] : cs;
    const out: (string[] | null)[] = [];
    const approx: number[] = [];
    let missing = 0;
    w.syls.forEach((y, i) => {
      const c = cs[i];
      if (!isHan(c) || (y.base === 'r' && c === '儿')) {
        out.push(null);
        return;
      }
      const r = hv.lookup(ts[i] ?? c, c, y);
      if (!r) {
        out.push(null);
        missing++;
        return;
      }
      out.push(r[0]);
      if (r[1]) approx.push(i);
    });
    if (out.some((x) => x)) w.hv = out;
    if (approx.length) w.hva = approx;
    if (missing && w.lv.e25 !== undefined) issues.add(`warn:thieu-han-viet-L${w.lv.e25}`, w.id);
  }
}

/** Chuyển bản nháp sang bản ghi xuất ra (thứ tự khoá cố định). */
export function toRecord(w: WordDraft): WordRec {
  const lv: WordRec['lv'] = {};
  if (w.lv.e25 !== undefined) lv.e25 = w.lv.e25;
  if (w.lv.s21 !== undefined) lv.s21 = w.lv.s21;
  if (w.lv.h20 !== undefined) lv.h20 = w.lv.h20;
  const rec: WordRec = { id: w.id, s: w.s, p: w.p, lv };
  if (w.t && w.t !== w.s) rec.t = w.t;
  const also = [...w.also].filter((x) => x !== w.lv.e25).sort((a, b) => a - b);
  if (also.length && w.lv.e25 !== undefined) rec.also = also;
  if (w.pos.length) rec.pos = w.pos;
  if (w.vi?.length) rec.vi = w.vi;
  if (w.en?.length) rec.en = w.en;
  if (w.hv) rec.hv = w.hv;
  if (w.hva?.length) rec.hva = w.hva;
  if (w.cl?.length) rec.cl = w.cl;
  // thứ tự khoá ổn định cho băm
  const order = ['id', 's', 't', 'p', 'lv', 'also', 'pos', 'vi', 'en', 'hv', 'hva', 'cl'] as const;
  return Object.fromEntries(order.filter((k) => k in rec).map((k) => [k, rec[k]])) as WordRec;
}

// ------------------------------------------------------------------ chữ

export interface CharInputs {
  r25: Map<string, number>;
  w25: Map<string, number>;
  std21: Map<string, Std21Char>;
  mmah: Map<string, MmahEntry>;
  hv: HanvietIndex;
  /** chữ → số nét (chỉ chữ có dữ liệu nét) */
  strokes: Map<string, number>;
  /** chữ giản → {phồn → số lần} từ các từ */
  pairCount: Map<string, Map<string, number>>;
  /** chữ → các âm tiết số gặp trong từ HSK */
  readingsInWords: Map<string, Set<string>>;
}

export function buildChar(c: string, inp: CharInputs, toNumbered: (marked: string) => string | null): CharRec {
  const lv: CharRec['lv'] = {};
  const r25 = inp.r25.get(c);
  const w25 = inp.w25.get(c);
  const s21 = inp.std21.get(c);
  if (r25) lv.r25 = r25;
  if (w25) lv.w25 = w25;
  if (s21) {
    lv.s21 = s21.level;
    if (s21.writing) lv.sw21 = s21.writing;
  }
  const rec: CharRec = { c, lv };
  // phồn thể
  const trad: string[] = [];
  for (const t of s21?.t ?? []) if (t !== c && !trad.includes(t)) trad.push(t);
  const pc = inp.pairCount.get(c);
  if (pc) {
    for (const [t] of [...pc.entries()].sort((a, b) => b[1] - a[1])) if (t !== c && !trad.includes(t)) trad.push(t);
  }
  if (trad.length) rec.t = trad;
  const sc = inp.strokes.get(c);
  if (sc) {
    rec.sc = sc;
    rec.st = 1;
  }
  const m = inp.mmah.get(c);
  if (m?.radical) rec.rad = m.radical;
  if (m?.decomposition && !m.decomposition.includes('？')) rec.dec = m.decomposition;
  if (m?.etymology?.type) {
    const et: NonNullable<CharRec['et']> = { t: m.etymology.type };
    if (m.etymology.hint) et.h = m.etymology.hint;
    if (m.etymology.semantic) et.s = m.etymology.semantic;
    if (m.etymology.phonetic) et.p = m.etymology.phonetic;
    rec.et = et;
  }
  if (m?.definition) rec.def = m.definition;
  // cách đọc: theo từ HSK trước, rồi Make Me a Hanzi
  const py: string[] = [];
  for (const k of inp.readingsInWords.get(c) ?? []) if (/^[a-z]+[1-4]$/.test(k) && !py.includes(k)) py.push(k);
  for (const p of m?.pinyin ?? []) {
    const k = toNumbered(p);
    if (k && !py.includes(k)) py.push(k);
  }
  if (py.length) rec.py = py;
  // Hán Việt theo pinyin: chữ phồn thể chính trước, rồi các chữ khác
  const hv: Record<string, string[]> = {};
  for (const form of [...(trad.length ? trad : []), c]) {
    for (const row of inp.hv.rows.get(form) ?? []) {
      const cur = hv[row.key] ?? [];
      for (const r of row.readings) if (!cur.includes(r)) cur.push(r);
      hv[row.key] = cur;
    }
  }
  if (Object.keys(hv).length) rec.hv = Object.fromEntries(Object.entries(hv).sort(([a], [b]) => (a === '*' ? 1 : b === '*' ? -1 : a < b ? -1 : 1)));
  return rec;
}
