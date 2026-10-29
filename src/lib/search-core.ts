/**
 * Lõi tìm kiếm cho Tra từ (chạy trong Web Worker, viết thuần để test được trên Node).
 *
 * Tìm theo: chữ Hán (khớp đúng → bắt đầu bằng → chứa); pinyin có số (ni3hao3), có dấu (nǐ hǎo) hoặc không dấu
 * (nihao, ni hao); âm Hán Việt có hoặc không dấu (học tập, hoc tap, đ = d); nghĩa tiếng Việt và tiếng Anh (MiniSearch).
 */
import MiniSearch from 'minisearch';
import type { SearchRow } from '../schema/data';
import { alignMarked, parseNumbered, type Syl } from './pinyin';
import { foldVi, foldWords, viCanon } from './text';

export interface Entry {
  id: string;
  /** giản thể */
  s: string;
  /** cấp 2025 (0 = ngoài HSK 2025) */
  lv: number;
  /** pinyin hiển thị */
  p: string;
  hv: string;
  vi: string;
  en: string;
  /** âm tiết theo id (一, 不 giữ thanh gốc) */
  syls: Syl[];
  /** thanh theo cách viết hiển thị, chỉ có khi khác id (一下 yíxià: [2, 4]) */
  dtones?: number[];
  /** pinyin không dấu viết liền, ü = v: "nihao", "nver" */
  base: string;
  /** như base nhưng ü = u, cho người gõ "nuer" thay "nver" */
  baseU: string;
  hvFold: string;
  hvCanon: string;
  /** nghĩa ở dạng so cụm từ; tính khi cần */
  textFold?: string;
  textCanon?: string;
}

export type Why = 'han' | 'pinyin' | 'hanviet' | 'nghia';

export interface Hit {
  id: string;
  s: string;
  lv: number;
  p: string;
  hv: string;
  vi: string;
  en: string;
  score: number;
  why: Why;
}

export function entryFromRow([id, lv, p, hv, vi, en]: SearchRow): Entry {
  const i = id.indexOf('_');
  const s = id.slice(0, i);
  const syls = parseNumbered(id.slice(i + 1)) ?? [];
  const base = syls.map((y) => y.base).join('');
  let dtones: number[] | undefined;
  if (/[一不]/.test(s)) {
    const shown = alignMarked(p, syls.map((y) => y.base));
    if (shown && shown.some((y, k) => y.tone !== syls[k].tone)) dtones = shown.map((y) => y.tone);
  }
  return { id, s, lv, p, hv, vi, en, syls, dtones, base, baseU: base.replace(/v/g, 'u'), hvFold: foldVi(hv), hvCanon: viCanon(hv) };
}

/* ---------- pinyin ---------- */

/** Dấu thanh pinyin dạng tổ hợp → thanh. */
const MARK_TONE = new Map([
  ['\u0304', 1],
  ['\u0301', 2],
  ['\u030C', 3],
  ['\u0300', 4],
]);

export interface PinyinMark {
  /** vị trí chữ cái mang thanh trong `joined` (với pinyin số: chữ cái ngay trước chữ số) */
  at: number;
  tone: number;
  /** pinyin số: chữ số đánh dấu chỗ hết âm tiết */
  boundary: boolean;
}

export interface PinyinQuery {
  /** chữ cái viết liền, không dấu, ü = v: "nihao" */
  joined: string;
  marks: PinyinMark[];
  /** vị trí trong `joined` có khoảng trắng hoặc dấu ' ngăn âm tiết ("xī'ān": [2]) */
  breaks: number[];
  /** người gõ đã dùng v/ü: không nới ü = u */
  hasV: boolean;
}

/**
 * Đọc truy vấn như pinyin: có dấu, có số, không dấu hay trộn lẫn. `null` nếu không thể là pinyin
 * (có dấu riêng của tiếng Việt, chữ Hán…). Không tách âm tiết: so với từng từ theo chữ cái, nên
 * "nǚér", "nü3er2", "xian" (先 / 西安) đều đọc được.
 */
export function parsePinyinQuery(q: string): PinyinQuery | null {
  const s = q.trim().toLowerCase().normalize('NFD').replace(/u\u0308|u:/g, 'v');
  let joined = '';
  const marks: PinyinMark[] = [];
  const breaks: number[] = [];
  for (const ch of s) {
    if (ch >= 'a' && ch <= 'z') joined += ch;
    else if (MARK_TONE.has(ch)) {
      if (!joined) return null;
      marks.push({ at: joined.length - 1, tone: MARK_TONE.get(ch)!, boundary: false });
    } else if (ch >= '1' && ch <= '5') {
      if (!joined) return null;
      marks.push({ at: joined.length - 1, tone: Number(ch), boundary: true });
    } else if (/[\s'’‘\-·]/.test(ch)) {
      if (joined && breaks.at(-1) !== joined.length) breaks.push(joined.length);
    } else return null;
  }
  if (!joined) return null;
  if (breaks.at(-1) === joined.length) breaks.pop();
  return { joined, marks, breaks, hasV: joined.includes('v') };
}

/**
 * Điểm khớp pinyin (0 = không khớp). Khớp trọn từ: 900 đúng mọi thanh, 820 đúng các thanh đã ghi, 800 không ghi thanh.
 * Khớp phần đầu (đang gõ dở): 150–400. Gõ u thay ü: trừ 30.
 */
export function pinyinScore(q: PinyinQuery, e: Entry): number {
  const n = q.joined.length;
  let penalty = 0;
  if (!e.base.startsWith(q.joined)) {
    if (q.hasV || e.baseU === e.base || !e.baseU.startsWith(q.joined)) return 0;
    penalty = 30;
  }
  const full = e.base.length === n;
  if (!full && n < 2) return 0;
  const covered = new Array<boolean>(e.syls.length).fill(false);
  if (q.marks.length || q.breaks.length) {
    // ends[k] = vị trí hết âm tiết k trong base
    const ends: number[] = [];
    let end = 0;
    for (const y of e.syls) ends.push((end += y.base.length));
    for (const b of q.breaks) if (!ends.includes(b)) return 0;
    for (const m of q.marks) {
      const k = ends.findIndex((x) => m.at < x);
      if (k < 0 || (m.boundary && m.at !== ends[k] - 1)) return 0;
      if (m.tone !== e.syls[k].tone && m.tone !== e.dtones?.[k]) return 0;
      covered[k] = true;
    }
  }
  if (!full) return Math.max(150, 400 - (e.base.length - n) * 8) - penalty;
  if (!q.marks.length) return 800 - penalty;
  // âm tiết khinh thanh không ghi dấu (xièxie) cũng là đã ghi đúng
  const all = e.syls.every((y, k) => covered[k] || y.tone === 5);
  return (all ? 900 : 820) - penalty;
}

/* ---------- Hán Việt ---------- */

export interface HvQuery {
  fold: string;
  canon: string;
  /** gõ không dấu: không phân biệt được với pinyin, nên không xếp trên pinyin */
  ascii: boolean;
}

export function prepareHv(q: string): HvQuery | null {
  const fold = foldVi(q);
  if (!fold) return null;
  return { fold, canon: viCanon(q), ascii: !/[^\x20-\x7e]/.test(q) };
}

/** Điểm khớp âm Hán Việt (0 = không khớp). */
export function hanvietScore(h: HvQuery, e: Entry): number {
  if (!e.hv) return 0;
  if (e.hvFold === h.fold) return h.ascii || e.hvCanon !== h.canon ? 760 : 880;
  if (h.fold.length < 2) return 0;
  const bonus = !h.ascii && ` ${e.hvCanon} `.includes(` ${h.canon} `) ? 40 : 0;
  if (e.hvFold.startsWith(h.fold + ' ')) return 330 + bonus;
  if (` ${e.hvFold} `.includes(` ${h.fold} `)) return 150 + bonus;
  // đang gõ dở âm cuối: "dai ho" → đại học
  if (e.hvFold.startsWith(h.fold)) return Math.max(120, 250 - (e.hvFold.length - h.fold.length) * 5);
  return 0;
}

/* ---------- chỉ mục ---------- */

const levelOrder = (lv: number) => (lv === 0 ? 8 : lv);

/** Nghĩa tiếng Việt và tiếng Anh ở dạng so cụm từ, đánh dấu ranh giới bằng khoảng trắng hai đầu. */
function phrase(e: Entry, h: HvQuery): { inText: boolean; whole: boolean } {
  const text = `${e.vi} ; ${e.en}`;
  const q = h.ascii ? h.fold : h.canon;
  const norm = h.ascii ? foldWords : viCanon;
  const padded = h.ascii ? (e.textFold ??= ` ${foldWords(text)} `) : (e.textCanon ??= ` ${viCanon(text)} `);
  if (!padded.includes(` ${q} `)) return { inText: false, whole: false };
  // trùng nguyên một nghĩa ("giáo viên" với 老师)
  const whole = text.split(/[;；]/).some((g) => norm(g.replace(/\([^)]*\)/g, ' ')) === q);
  return { inText: true, whole };
}

export class SearchIndex {
  readonly entries: Entry[] = [];
  readonly byId = new Map<string, Entry>();
  private readonly mini = new MiniSearch<{ id: string; vi: string; en: string }>({
    fields: ['vi', 'en'],
    storeFields: [],
    processTerm: (term) => foldVi(term) || null,
  });

  add(rows: readonly SearchRow[]) {
    const docs: { id: string; vi: string; en: string }[] = [];
    for (const r of rows) {
      if (this.byId.has(r[0])) continue;
      const e = entryFromRow(r);
      this.entries.push(e);
      this.byId.set(e.id, e);
      docs.push({ id: e.id, vi: e.vi, en: e.en });
    }
    this.mini.addAll(docs);
  }

  get size() {
    return this.entries.length;
  }

  search(qRaw: string, limit = 50): Hit[] {
    const q = qRaw.trim().normalize('NFC');
    if (!q) return [];
    const best = new Map<string, { score: number; why: Why }>();
    const bump = (id: string, score: number, why: Why) => {
      if (score <= 0) return;
      const cur = best.get(id);
      if (!cur || score > cur.score) best.set(id, { score, why });
    };
    if (/\p{Script=Han}/u.test(q)) {
      for (const e of this.entries) {
        if (e.s === q) bump(e.id, 1000, 'han');
        else if (e.s.startsWith(q)) bump(e.id, 600 - e.s.length, 'han');
        else if (e.s.includes(q)) bump(e.id, 300 - e.s.length, 'han');
      }
    } else {
      const pq = parsePinyinQuery(q);
      const hq = prepareHv(q);
      for (const e of this.entries) {
        if (pq) bump(e.id, pinyinScore(pq, e), 'pinyin');
        if (hq) bump(e.id, hanvietScore(hq, e), 'hanviet');
      }
      if (hq && hq.fold.length >= 2) {
        const res = this.mini.search(q, {
          prefix: (_t, i, terms) => i === terms.length - 1,
          fuzzy: (t) => (t.length >= 6 ? 0.2 : false),
          combineWith: 'AND',
          boost: { vi: 2, en: 1 },
        });
        const top = res[0]?.score ?? 1;
        for (const r of res.slice(0, 300)) {
          const e = this.byId.get(String(r.id));
          if (!e) continue;
          const ph = phrase(e, hq);
          bump(e.id, 100 + Math.round(200 * (r.score / top)) + (ph.inText ? 80 : 0) + (ph.whole ? 40 : 0), 'nghia');
        }
      }
    }
    return [...best.entries()]
      .map(([id, b]) => {
        const e = this.byId.get(id)!;
        // khớp không trọn (gõ dở, khớp một phần nghĩa): ưu tiên nhẹ từ cấp thấp, thường gặp hơn
        const score = b.score >= 700 ? b.score : b.score - (levelOrder(e.lv) - 1) * 5;
        return { e, score, why: b.why };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          levelOrder(a.e.lv) - levelOrder(b.e.lv) ||
          a.e.s.length - b.e.s.length ||
          (a.e.id < b.e.id ? -1 : 1),
      )
      .slice(0, limit)
      .map(({ e, score, why }) => ({ id: e.id, s: e.s, lv: e.lv, p: e.p, hv: e.hv, vi: e.vi, en: e.en, score, why }));
  }

  /** Các từ có đúng chuỗi giản thể `s` (từ đồng tự khác âm cho ra nhiều mục). */
  resolve(s: string): Entry[] {
    return this.entries.filter((e) => e.s === s).sort((a, b) => levelOrder(a.lv) - levelOrder(b.lv) || (a.id < b.id ? -1 : 1));
  }

  /** `n` từ chứa chữ `c` (không tính chính chữ đó), cấp thấp và từ ngắn trước. */
  containing(c: string, n: number): Entry[] {
    return this.entries
      .filter((e) => e.s !== c && e.s.includes(c))
      .sort((a, b) => levelOrder(a.lv) - levelOrder(b.lv) || a.s.length - b.s.length || (a.id < b.id ? -1 : 1))
      .slice(0, n);
  }
}
