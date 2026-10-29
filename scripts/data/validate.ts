/**
 * Bước validate: kiểm tra số lượng theo đề cương, tham chiếu, độ phủ của HSK 1. Lỗi → pipeline dừng.
 */
import { parseNumbered } from '../../src/lib/pinyin.ts';
import { E25_LEVELS, type CharRec, type LevelList, type WordRec } from '../../src/schema/data.ts';
import type { DataFixes } from './fixes.ts';

/** Tổng số mục theo từng cấp của đề cương 2025 (300 / 500 / 1.000 / 2.000 / 3.600 / 5.400 / 11.000 cộng dồn). */
export const SYLLABUS_ENTRIES: Record<string, number> = { '1': 300, '2': 200, '3': 500, '4': 1000, '5': 1600, '6': 1800, '7': 5600 };
/** Số chuỗi từ phân biệt theo cấp trong bảng của harukicoder (kiểm tra nguồn không đổi ngoài ý muốn). */
export const SYLLABUS_DISTINCT: Record<string, number> = { '1': 300, '2': 197, '3': 491, '4': 990, '5': 1579, '6': 1777, '7': 5562 };
export const READING_CHARS: Record<string, number> = { '1': 246, '2': 125, '3': 284, '4': 441, '5': 431, '6': 413, '7': 1148 };
export const WRITING_CHARS: Record<string, number> = { '1': 100, '2': 0, '3': 150, '4': 150, '5': 150, '6': 150, '7': 500 };

export interface Check {
  errors: string[];
  warnings: string[];
  stats: Record<string, unknown>;
}

const pct = (a: number, b: number) => Math.abs(a - b) / b;

export function validateAll(input: {
  words: WordRec[];
  chars: CharRec[];
  levels: LevelList[];
  harukiByLevel: Record<string, number>;
  fixes: DataFixes;
}): Check {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: Record<string, unknown> = {};
  const { words, chars, levels } = input;

  // id duy nhất
  const ids = new Set<string>();
  for (const w of words) {
    if (ids.has(w.id)) errors.push(`Trùng id từ ${w.id}`);
    ids.add(w.id);
  }
  const charSet = new Set<string>();
  for (const c of chars) {
    if (charSet.has(c.c)) errors.push(`Trùng chữ ${c.c}`);
    charSet.add(c.c);
  }

  // tham chiếu: danh sách chữ theo cấp ↔ bản ghi chữ
  const listed = new Set<string>();
  for (const l of levels) {
    for (const c of [...l.chars, ...l.writing]) if (!charSet.has(c)) errors.push(`Danh sách cấp ${l.level} trỏ tới chữ không tồn tại: ${c}`);
    for (const c of l.chars) listed.add(c);
  }
  for (const c of chars) if (!listed.has(c.c)) errors.push(`Chữ ${c.c} không nằm trong danh sách cấp nào`);
  // mọi chữ Hán trong từ đều có bản ghi chữ
  for (const w of words) for (const c of w.s) if (/\p{Script=Han}/u.test(c) && !charSet.has(c)) errors.push(`Thiếu bản ghi chữ ${c} (trong ${w.id})`);

  // số mục theo cấp (tính cả mục xuất hiện lại ở cấp khác)
  const entries: Record<string, number> = {};
  const primary: Record<string, number> = {};
  for (const w of words) {
    if (w.lv.e25 === undefined) continue;
    const k = String(w.lv.e25);
    primary[k] = (primary[k] ?? 0) + 1;
    entries[k] = (entries[k] ?? 0) + 1;
    for (const a of w.also ?? []) entries[String(a)] = (entries[String(a)] ?? 0) + 1;
  }
  stats.entriesByLevel = entries;
  stats.wordsByLevel = primary;
  for (const lv of E25_LEVELS) {
    // Tổng của đề cương tính mỗi mục một lần ở cấp chính (mục "cũng ở cấp khác" không tính lại).
    const got = primary[lv] ?? 0;
    if (pct(got, SYLLABUS_ENTRIES[lv]) > 0.01) {
      errors.push(`Cấp ${lv}: ${got} mục, đề cương có ${SYLLABUS_ENTRIES[lv]} (lệch quá 1%)`);
    }
    if (input.harukiByLevel[lv] !== SYLLABUS_DISTINCT[lv]) {
      errors.push(`Bảng harukicoder cấp ${lv} có ${input.harukiByLevel[lv]} từ, dự kiến ${SYLLABUS_DISTINCT[lv]}`);
    }
  }

  // chữ đọc, chữ viết tay
  const r25: Record<string, number> = {};
  const w25: Record<string, number> = {};
  let writingNoStroke = 0;
  let readingNoStroke = 0;
  for (const c of chars) {
    if (c.lv.r25) {
      r25[c.lv.r25] = (r25[c.lv.r25] ?? 0) + 1;
      if (!c.st) readingNoStroke++;
    }
    if (c.lv.w25) {
      w25[c.lv.w25] = (w25[c.lv.w25] ?? 0) + 1;
      if (!c.st) {
        writingNoStroke++;
        errors.push(`Chữ viết tay ${c.c} không có dữ liệu nét`);
      }
    }
  }
  stats.readingChars = r25;
  stats.writingChars = w25;
  for (const lv of E25_LEVELS) {
    if ((r25[lv] ?? 0) !== READING_CHARS[lv]) errors.push(`Cấp ${lv}: ${r25[lv] ?? 0} chữ đọc, dự kiến ${READING_CHARS[lv]}`);
    if ((w25[lv] ?? 0) !== WRITING_CHARS[lv]) errors.push(`Cấp ${lv}: ${w25[lv] ?? 0} chữ viết tay, dự kiến ${WRITING_CHARS[lv]}`);
  }
  if (readingNoStroke) warnings.push(`${readingNoStroke} chữ đọc HSK 2025 không có dữ liệu nét`);
  stats.strokeCoverage = { readingNoStroke, writingNoStroke };

  // độ phủ theo cấp
  const cov: Record<string, { n: number; vi: number; hv: number; en: number }> = {};
  for (const w of words) {
    const k = w.lv.e25 !== undefined ? String(w.lv.e25) : 'x';
    const c = (cov[k] ??= { n: 0, vi: 0, hv: 0, en: 0 });
    c.n++;
    if (w.vi?.length) c.vi++;
    if (w.en?.length) c.en++;
    if (w.hv && hvComplete(w)) c.hv++;
  }
  stats.coverage = cov;
  // HSK 1: bắt buộc đủ nghĩa Việt và Hán Việt
  for (const w of words) {
    if (w.lv.e25 !== 1) continue;
    if (!w.vi?.length) errors.push(`Từ HSK 1 thiếu nghĩa tiếng Việt: ${w.id}`);
    if (!w.hv || !hvComplete(w)) errors.push(`Từ HSK 1 thiếu âm Hán Việt: ${w.id}`);
  }
  // kiểm tra hồi quy: các ghi đè trong content/*-fixes.yaml phải còn hiệu lực
  const wordById = new Map(words.map((w) => [w.id, w]));
  const wordByString = new Map<string, WordRec[]>();
  for (const w of words) wordByString.set(w.s, [...(wordByString.get(w.s) ?? []), w]);
  for (const [id, want] of Object.entries(input.fixes.hanviet)) {
    const w = wordById.get(id);
    if (!w) {
      errors.push(`hanviet-fixes.yaml: không có từ ${id} (id đổi hoặc từ bị loại khỏi đề cương? cập nhật file fix)`);
      continue;
    }
    const got = (w.hv ?? []).map((x) => x?.[0] ?? '').join(' ');
    if (got !== want.join(' ')) errors.push(`Hán Việt của ${id}: build ra "${got}", hanviet-fixes.yaml yêu cầu "${want.join(' ')}"`);
  }
  for (const [s, g] of Object.entries(input.fixes.gloss)) {
    const targets = wordByString.get(s) ?? [];
    if (!targets.length) warnings.push(`gloss-fixes.yaml: "${s}" không phải từ HSK (chỉ áp cho từ điển mở rộng)`);
    for (const w of targets) {
      for (const d of g.drop ?? []) {
        if (w.vi?.includes(d)) errors.push(`Nghĩa "${d}" vẫn còn ở ${w.id} dù gloss-fixes.yaml yêu cầu bỏ`);
      }
      if (g.vi && JSON.stringify(w.vi) !== JSON.stringify(g.vi))
        errors.push(`Nghĩa của ${w.id}: build ra "${(w.vi ?? []).join('; ')}", gloss-fixes.yaml yêu cầu "${g.vi.join('; ')}"`);
    }
  }
  // kiểm tra hồi quy: pinyin-fixes.yaml phải còn hiệu lực (pinyin build ra khớp giá trị fix)
  for (const [s, want] of Object.entries(input.fixes.pinyin ?? {})) {
    const targets = wordByString.get(s) ?? [];
    if (!targets.length) {
      errors.push(`pinyin-fixes.yaml: không có từ "${s}" (từ bị loại khỏi đề cương? cập nhật file fix)`);
      continue;
    }
    for (const w of targets) {
      if (w.p !== want) errors.push(`Pinyin của ${w.id}: build ra "${w.p}", pinyin-fixes.yaml yêu cầu "${want}"`);
    }
  }
  return { errors, warnings, stats };
}

/** Mọi âm tiết chữ Hán (trừ 儿 hoá, âm `r`) đều có âm Hán Việt. */
export function hvComplete(w: WordRec): boolean {
  const syls = parseNumbered(w.id.slice(w.id.indexOf('_') + 1)) ?? [];
  return [...w.s].every((c, i) => !/\p{Script=Han}/u.test(c) || syls[i]?.base === 'r' || !!w.hv?.[i]?.length);
}
