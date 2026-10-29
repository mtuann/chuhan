/**
 * 214 bộ Khang Hy cho trang chữ: số bộ, chữ bộ, các dạng biến thể và âm Hán Việt của chữ bộ (spec 00 mục 6: không
 * tự đặt tên bộ, chỉ lấy từ dữ liệu).
 *
 * - Số bộ và dạng biến thể: Unicode (CJKRadicals.txt: số bộ → chữ bộ, chữ thống nhất; dạng giản thể có dấu ', như
 *   120' 纟; EquivalentUnifiedIdeograph.txt: chữ bộ bổ sung ⺡ → chữ thống nhất 氵, kèm tên tiếng Anh trong chú thích).
 * - Dạng bộ của từng chữ: trường `radical` của Make Me a Hanzi (đã có trong gói chữ, trường `rad`).
 * - Âm Hán Việt: bảng Hán Việt của dự án, theo cách đọc pinyin chính của chữ bộ (Make Me a Hanzi).
 * - Tên gọi khác: content/radicals.yaml, chỉ những tên có nguồn.
 */
import { z } from 'zod';
import { DATA_VERSION, RadicalsPack, type RadicalRec } from '../../src/schema/data.ts';

export interface UnicodeRadicals {
  /** số bộ → chữ thống nhất của bộ (dòng không có dấu ' trong CJKRadicals.txt) */
  kangxi: Map<number, string>;
  /** một dạng (chữ thống nhất hoặc chữ trong khối bộ thủ) → các số bộ */
  formNums: Map<string, Set<number>>;
}

const cp = (hex: string) => String.fromCodePoint(parseInt(hex, 16));
const isRadicalBlock = (code: number) => (code >= 0x2e80 && code <= 0x2eff) || (code >= 0x2f00 && code <= 0x2fdf);

/** Tên bộ bổ sung (CJK RADICAL …) không trùng tên bộ Khang Hy: bộ Khang Hy tương ứng. */
const NAME_ALIAS: Record<string, string> = {
  PERSON: 'MAN',
  PAW: 'CLAW',
  MOTHER: 'DO NOT',
  SNAKE: 'ONESELF',
  CHOKE: 'NOT',
  CIVILIAN: 'CLAN',
  MESH: 'NET',
  RAM: 'SHEEP',
  EWE: 'SHEEP',
  THREAD: 'SHORT THREAD',
  BOX: 'DOWN BOX',
};
/** Dạng bộ trong dữ liệu chữ không có trong hai tệp Unicode: xếp theo bộ Khang Hy chứa nó. */
const FORM_EXTRA: Record<string, number> = { 丷: 12, 户: 63, 川: 47, 刁: 18, '⺀': 15 };

const normName = (n: string) =>
  n
    .replace(/^(?:C-SIMPLIFIED |J-SIMPLIFIED |SIMPLIFIED |TRADITIONAL )/, '')
    .replace(/ (?:ONE|TWO|THREE|FOUR)$/, '')
    .trim();

export function parseUnicodeRadicals(cjkRadicals: string, equivalent: string): UnicodeRadicals {
  const kangxi = new Map<number, string>();
  const formNums = new Map<string, Set<number>>();
  const add = (form: string, n: number) => {
    const s = formNums.get(form) ?? new Set<number>();
    s.add(n);
    formNums.set(form, s);
  };
  for (const raw of cjkRadicals.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const [num, rad, ideo] = line.split(';').map((x) => x.trim());
    const n = parseInt(num, 10);
    if (!(n >= 1 && n <= 214) || !ideo) continue;
    if (!num.includes("'")) kangxi.set(n, cp(ideo));
    add(cp(ideo), n);
    if (rad) add(cp(rad), n);
  }
  // tên bộ Khang Hy (2F00…2FD5) và bộ bổ sung (2E80…2EF3) lấy từ chú thích
  const lines: { from: number[]; to: string; names: string[] }[] = [];
  for (const raw of equivalent.split('\n')) {
    const m = /^([0-9A-F]{4,6})(?:\.\.([0-9A-F]{4,6}))?\s*;\s*([0-9A-F]{4,6})\s*#\s*(?:\[\d+\]\s*)?(.+)$/.exec(raw.trim());
    if (!m) continue;
    const lo = parseInt(m[1], 16);
    const hi = m[2] ? parseInt(m[2], 16) : lo;
    const from: number[] = [];
    for (let c = lo; c <= hi; c++) if (isRadicalBlock(c)) from.push(c);
    if (from.length) lines.push({ from, to: cp(m[3]), names: m[4].split('..').map((x) => x.trim()) });
  }
  const kxByName = new Map<string, number>();
  for (const l of lines)
    for (const c of l.from) if (c >= 0x2f00 && c <= 0x2fd5 && l.names[0].startsWith('KANGXI RADICAL ')) kxByName.set(l.names[0].slice(15), c - 0x2f00 + 1);
  for (const l of lines) {
    for (const c of l.from) {
      let n: number | undefined;
      if (c >= 0x2f00 && c <= 0x2fd5) n = c - 0x2f00 + 1;
      else {
        const base = normName(l.names[0].replace(/^CJK RADICAL /, ''));
        n = kxByName.get(base) ?? kxByName.get(NAME_ALIAS[base] ?? '');
      }
      if (!n) continue;
      add(String.fromCodePoint(c), n);
      add(l.to, n);
    }
  }
  return { kangxi, formNums };
}

export const RadicalsFile = z
  .object({
    status: z.string().optional(),
    by: z.string().optional(),
    /** nguồn của các tên gọi khác */
    source: z.string().min(1),
    names: z.array(z.object({ n: z.number().int().min(1).max(214), form: z.string().min(1), aka: z.string().min(1) }).strict()),
  })
  .strict();

export interface RadicalInput {
  unicode: UnicodeRadicals;
  /** các dạng bộ dùng trong dữ liệu chữ (trường `rad`) */
  forms: Iterable<string>;
  /** âm Hán Việt của một chữ theo cách đọc chính (cách đọc chính trước) */
  hanviet: (c: string) => string[];
  /** chữ có 阝 bên phải theo cấu tạo (bộ 邑) */
  cityRight?: Iterable<string>;
  file?: unknown;
}

export function buildRadicals(input: RadicalInput): { pack: RadicalsPack; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { kangxi, formNums } = input.unicode;
  if (kangxi.size !== 214) errors.push(`radicals: CJKRadicals.txt có ${kangxi.size} bộ Khang Hy, cần 214`);
  const forms: Record<string, number> = {};
  const formsOf = new Map<number, string[]>();
  for (const f of [...new Set(input.forms)].sort()) {
    const nums = new Set([...(formNums.get(f) ?? []), ...(FORM_EXTRA[f] ? [FORM_EXTRA[f]] : [])]);
    if (nums.size !== 1) {
      warnings.push(`radicals: dạng bộ ${f} ${nums.size ? `ứng với nhiều bộ (${[...nums].join(', ')})` : 'không xếp được vào bộ Khang Hy nào'}`);
      continue;
    }
    const n = [...nums][0];
    forms[f] = n;
    if (f !== kangxi.get(n)) formsOf.set(n, [...(formsOf.get(n) ?? []), f]);
  }
  const parsed = input.file === undefined ? undefined : RadicalsFile.safeParse(input.file);
  if (parsed && !parsed.success) errors.push(`radicals.yaml: sai cấu trúc: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const aka = new Map<number, [string, string][]>();
  for (const x of parsed?.success ? parsed.data.names : []) {
    // dạng không có trong dữ liệu (như 𠆢) thì theo số bộ ghi trong tệp
    const n = forms[x.form] ?? [...kangxi].find(([, c]) => c === x.form)?.[0] ?? [...(formNums.get(x.form) ?? [])][0];
    if (n !== undefined && n !== x.n) errors.push(`radicals.yaml: dạng ${x.form} không thuộc bộ số ${x.n}`);
    aka.set(x.n, [...(aka.get(x.n) ?? []), [x.form, x.aka]]);
  }
  const radicals: RadicalRec[] = [];
  for (let n = 1; n <= 214; n++) {
    const c = kangxi.get(n);
    if (!c) continue;
    const r: RadicalRec = { n, c };
    const f = formsOf.get(n);
    if (f?.length) r.f = f;
    const hv = input.hanviet(c);
    if (hv.length) r.hv = hv;
    const a = aka.get(n);
    if (a?.length) r.aka = a;
    radicals.push(r);
  }
  const raw = { v: DATA_VERSION, radicals, forms, cityRight: [...new Set(input.cityRight ?? [])].sort() } as RadicalsPack;
  const res = RadicalsPack.safeParse(raw);
  if (!res.success) errors.push(`radicals: gói sai cấu trúc: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return { pack: res.success ? res.data : raw, errors, warnings };
}
