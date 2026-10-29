/**
 * Đọc từng nguồn thành bản ghi thô. Hàm thuần (chuỗi vào → dữ liệu ra) để test được không cần mạng.
 */
import { parseNumbered, type Syl } from '../../src/lib/pinyin.ts';

/** Bỏ BOM, đổi CRLF → LF, tách dòng, bỏ dòng rỗng. */
export function lines(text: string): string[] {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
}

/** "7-9" → 7; "3" → 3. */
export function levelNum(s: string): number {
  const t = s.trim();
  if (t === '7-9') return 7;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1 || n > 7) throw new Error(`Cấp không hợp lệ: "${s}"`);
  return n;
}

/** Từ loại kiểu đề cương "形、（副）、（动）" → ["形","副","动"]. */
export function splitPos(s: string): string[] {
  const out: string[] = [];
  for (const part of s.split(/[、,，\/]/)) {
    const p = part.replace(/[（）()]/g, '').trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

const PINYIN_LETTER = /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i;

// ------------------------------------------------------------------ đề cương 2025 (harukicoder)

export interface SyllabusWordRow {
  s: string;
  level: number;
  also: number[];
  pinyin: string;
  pos: string[];
}

/**
 * Bảng `word level also pinyin pos`. Một số dòng có pinyin chứa dấu cách bị tách nhầm sang cột từ loại
 * (ví dụ 不客气 → "bú" | "kèqi"); khi cột từ loại có chữ Latin thì ghép lại vào pinyin.
 */
export function parseSyllabusWords(text: string): SyllabusWordRow[] {
  const [header, ...rows] = lines(text);
  if (!header.startsWith('word\tlevel')) throw new Error('syllabus2025_words.tsv: sai tiêu đề');
  return rows.map((line) => {
    const [s, level, also, pinyin, pos = ''] = line.split('\t');
    let py = pinyin.trim();
    let posText = pos.trim();
    if (PINYIN_LETTER.test(posText)) {
      py = `${py} ${posText}`;
      posText = '';
    }
    return {
      s: s.trim(),
      level: levelNum(level),
      also: also.trim() ? also.split(',').map(levelNum) : [],
      pinyin: py,
      pos: splitPos(posText),
    };
  });
}

/** Bảng `character level`. */
export function parseSyllabusChars(text: string): { c: string; level: number }[] {
  const [header, ...rows] = lines(text);
  if (!header.startsWith('character\tlevel')) throw new Error('syllabus2025 chars: sai tiêu đề');
  return rows.map((line) => {
    const [c, level] = line.split('\t');
    return { c: c.trim(), level: levelNum(level) };
  });
}

// ------------------------------------------------------------------ krmanik (Anki, đề cương 2025)

export interface KrmanikRow {
  s: string;
  pinyin: string;
  level: number;
  also: number[];
  pos: string[];
}

/** Cột: giản thể, phồn thể, pinyin, chú âm, cấp "1（2）（4）", từ loại, tần suất, HTML. Chỉ lấy phần dữ kiện. */
export function parseKrmanikAnki(text: string): KrmanikRow[] {
  return lines(text).map((line) => {
    const cols = line.split('\t');
    if (cols.length < 6) throw new Error(`krmanik: dòng thiếu cột: ${line.slice(0, 40)}`);
    const levelField = cols[4].trim();
    const m = /^([0-9-]+)((?:（[0-9-]+）)*)$/.exec(levelField);
    if (!m) throw new Error(`krmanik: cấp lạ "${levelField}"`);
    const also = [...m[2].matchAll(/（([0-9-]+)）/g)].map((x) => levelNum(x[1]));
    return { s: cols[0].trim(), pinyin: cols[2].trim(), level: levelNum(m[1]), also, pos: splitPos(cols[5]) };
  });
}

// ------------------------------------------------------------------ CSV đơn giản (có ngoặc kép)

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

// ------------------------------------------------------------------ chuẩn 2021 (ivankra)

export interface Std21Word {
  s: string;
  t: string;
  /** Pinyin dạng số từ cột CEDICT (ưu tiên) */
  numbered?: string;
  /** Pinyin dạng dấu (dự phòng khi không có CEDICT) */
  marked: string;
  level: number;
}

/** "愛好|爱好[ai4 hao4]/..." → { t, s, numbered } của mục đầu. */
export function parseCedictRef(ref: string): { t: string; s: string; numbered: string } | null {
  const first = ref.split('/')[0]?.trim();
  if (!first) return null;
  const m = /^([^|[\]]+)(?:\|([^[\]]+))?\[([^\]]+)\]$/.exec(first);
  if (!m) return null;
  return { t: m[1], s: m[2] ?? m[1], numbered: m[3] };
}

/**
 * Bảng từ chuẩn 2021. Mục có biến thể (爸爸|爸) được tách theo cột Variants; mục "ví dụ" (第二 trong 第（第二）) bị bỏ.
 * Mục chứa "…" (mẫu ngữ pháp như …极了) không phải từ, bị bỏ.
 */
export function parseStd21Words(text: string): Std21Word[] {
  const [header, ...rows] = parseCsv(text);
  const idx = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`hsk30.csv thiếu cột ${name}`);
    return i;
  };
  const [cS, cT, cP, cL, cV, cC] = ['Simplified', 'Traditional', 'Pinyin', 'Level', 'Variants', 'CEDICT'].map(idx);
  const out: Std21Word[] = [];
  for (const r of rows) {
    const level = levelNum(r[cL]);
    const variants = r[cV]?.trim();
    const items: { s: string; t: string; p: string; ced: string }[] = [];
    if (variants) {
      const list = JSON.parse(variants) as Record<string, string>[];
      for (const v of list) {
        if (v.Example) continue;
        items.push({ s: v.Simplified, t: v.Traditional ?? v.Simplified, p: v.Pinyin ?? '', ced: v.CEDICT ?? '' });
      }
    } else if (r[cS].includes('|')) {
      const ss = r[cS].split('|');
      const ts = r[cT].split('|');
      const ps = r[cP].split('|');
      ss.forEach((s, i) => items.push({ s, t: ts[i] ?? s, p: ps[i] ?? '', ced: i === 0 ? r[cC] : '' }));
    } else {
      items.push({ s: r[cS], t: r[cT], p: r[cP], ced: r[cC] });
    }
    for (const it of items) {
      const s = it.s.replace(/\d+$/, '').trim();
      if (!s || s.includes('…')) continue;
      const ref = it.ced ? parseCedictRef(it.ced) : null;
      // Phần trong ngoặc là ví dụ hoặc chữ tuỳ chọn: 有（一）些 → 有一些 và 有些.
      const opt = /^(.*)（(.+)）(.*)$/.exec(s);
      if (opt) {
        const pm = /^(.*)\((.+)\)(.*)$/.exec(it.p.replace(/\s*\(\s*/, '(').replace(/\s*\)\s*/, ')'));
        if (opt[1] && opt[3] && pm) {
          // tuỳ chọn ở giữa
          out.push({ s: opt[1] + opt[2] + opt[3], t: opt[1] + opt[2] + opt[3], marked: pm[1] + pm[2] + pm[3], level });
          out.push({ s: opt[1] + opt[3], t: opt[1] + opt[3], marked: pm[1] + pm[3], level });
        } else if (opt[1] && !opt[3]) {
          // ví dụ ở cuối: 们（朋友们）→ chỉ lấy 们
          out.push({ s: opt[1], t: (it.t.split('（')[0] || opt[1]).trim(), marked: it.p.split('(')[0].trim(), numbered: ref?.s === opt[1] ? ref.numbered : undefined, level });
        }
        continue;
      }
      // Giữ đủ các dạng phồn thể của cột Traditional (台|臺) để chọn đúng mục từ điển.
      out.push({ s, t: it.t.replace(/\d+$/, '').trim() || ref?.t || s, numbered: ref?.s === s ? ref.numbered : undefined, marked: it.p, level });
    }
  }
  return out;
}

export interface Std21Char {
  c: string;
  level: number;
  writing?: number;
  t: string[];
}

export function parseStd21Chars(text: string): Std21Char[] {
  const [header, ...rows] = parseCsv(text);
  const [cH, cL, cW, cT] = ['Hanzi', 'Level', 'WritingLevel', 'Traditional'].map((n) => header.indexOf(n));
  return rows.map((r) => ({
    c: r[cH].trim(),
    level: levelNum(r[cL]),
    writing: r[cW]?.trim() ? levelNum(r[cW]) : undefined,
    t: [...new Set((r[cT] || '').split(/[|/]/).map((x) => x.trim()))].filter((x) => x && x !== r[cH].trim()),
  }));
}

// ------------------------------------------------------------------ HSK 2.0 (hskhsk)

export interface Hsk20Word {
  s: string;
  t: string;
  syls: Syl[] | null;
  marked: string;
  en: string;
  level: number;
}

/** TSV: giản thể, phồn thể, pinyin số liền (nv3'er2), pinyin dấu, nghĩa Anh. */
export function parseHsk20(text: string, level: number): Hsk20Word[] {
  return lines(text).map((line) => {
    const [s, t, numbered, marked, en] = line.split('\t');
    return { s: s.trim(), t: (t ?? s).trim(), syls: parseNumbered(numbered ?? ''), marked: (marked ?? '').trim(), en: (en ?? '').trim(), level };
  });
}

// ------------------------------------------------------------------ CVDICT (định dạng CC-CEDICT)

export interface DictLine {
  t: string;
  s: string;
  /** Pinyin dạng số như trong nguồn, ví dụ "ai4 hao4", "Zhong1 guo2". */
  pinyin: string;
  /** Âm tiết đã tách; null nếu pinyin có phần không phải âm tiết (chữ cái Latin…). */
  syls: Syl[] | null;
  glosses: string[];
  /** Lượng từ (giản thể) lấy từ mục "LT:". */
  cl: string[];
  /** Pinyin viết hoa (tên riêng, họ…). */
  cap: boolean;
}

const DICT_RE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;

/** Rút gọn tham chiếu "愛好|爱好[ai4 hao4]" → "爱好[ai4 hao4]" trong nghĩa. */
export function simplifyRefs(gloss: string): string {
  return gloss.replace(/([^\s|[\]/,;()（）]+)\|([^\s|[\]/,;()（）]+)\[/g, '$2[');
}

export function parseDict(text: string): DictLine[] {
  const out: DictLine[] = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = DICT_RE.exec(line);
    if (!m) continue;
    const glosses: string[] = [];
    const cl: string[] = [];
    for (const g of m[4].split('/')) {
      const gl = g.trim();
      if (!gl) continue;
      const lt = /^(?:LT|CL):\s*(.+)$/.exec(gl);
      if (lt) {
        for (const item of lt[1].split(/[,，]/)) {
          const x = /^(?:[^|[\]]+\|)?([^|[\]]+)\[/.exec(item.trim());
          if (x && !cl.includes(x[1])) cl.push(x[1]);
        }
        continue;
      }
      glosses.push(simplifyRefs(gl));
    }
    out.push({ t: m[1], s: m[2], pinyin: m[3], syls: parseNumbered(m[3]), glosses, cl, cap: /^[A-Z]/.test(m[3]) });
  }
  return out;
}

// ------------------------------------------------------------------ Hán Việt

export interface HanvietRow {
  /** Chữ phồn thể */
  c: string;
  readings: string[];
  /** Âm tiết dạng số (ü → v, chữ thường) hoặc "*" khi không gắn pinyin. */
  key: string;
}

export function parseHanviet(text: string): HanvietRow[] {
  const [header, ...rows] = parseCsv(text);
  if (header.join(',') !== 'char,hanviet,pinyin') throw new Error('hanviet.csv: sai tiêu đề');
  return rows.map((r) => {
    const readings = [...r[1].matchAll(/'([^']*)'/g)].map((m) => m[1].trim().normalize('NFC')).filter(Boolean);
    const p = r[2].trim();
    const key = p === '*' ? '*' : p.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v');
    return { c: r[0].trim(), readings, key };
  });
}

// ------------------------------------------------------------------ Make Me a Hanzi

export interface MmahEntry {
  character: string;
  definition?: string;
  pinyin?: string[];
  decomposition?: string;
  etymology?: { type: 'ideographic' | 'pictographic' | 'pictophonetic'; hint?: string; semantic?: string; phonetic?: string };
  radical?: string;
}

export function parseMmah(text: string): Map<string, MmahEntry> {
  const map = new Map<string, MmahEntry>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const e = JSON.parse(line) as MmahEntry;
    map.set(e.character, e);
  }
  return map;
}

// ------------------------------------------------------------------ complete-hsk-vocabulary

export interface ChvForm {
  t: string;
  syls: Syl[] | null;
  meanings: string[];
  classifiers: string[];
  cap: boolean;
}

/**
 * Hạng tần suất từ của complete-hsk-vocabulary (trường `q`: số nhỏ là từ hay gặp), theo chữ giản thể. Dùng để xếp
 * chữ gợi ý của bộ gõ pinyin.
 */
export function parseChvRank(json: string): Map<string, number> {
  const arr = JSON.parse(json) as { s: string; q?: number }[];
  const map = new Map<string, number>();
  for (const w of arr) if (typeof w.q === 'number' && w.q > 0) map.set(w.s, Math.min(w.q, map.get(w.s) ?? Infinity));
  return map;
}

export function parseChv(json: string): Map<string, ChvForm[]> {
  const arr = JSON.parse(json) as { s: string; f: { t: string; i: { n: string }; m: string[]; c: string[][] }[] }[];
  const map = new Map<string, ChvForm[]>();
  for (const w of arr) {
    const forms = w.f.map((f) => ({
      t: f.t,
      syls: parseNumbered(f.i.n),
      meanings: f.m.map((x) => simplifyRefs(x.trim())).filter(Boolean),
      classifiers: [...new Set(f.c.flat())],
      cap: /^[A-Z]/.test(f.i.n),
    }));
    map.set(w.s, [...(map.get(w.s) ?? []), ...forms]);
  }
  return map;
}
