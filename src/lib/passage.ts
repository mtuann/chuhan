/**
 * Gõ theo đoạn văn: chia một đoạn văn bản (đã tách từ) thành các câu để gõ lần lượt, mỗi câu kèm các chữ Hán và dấu câu
 * tiếng Trung cần gõ, âm tiết của chữ Hán (lấy từ pinyin của từ). Câu quá dài thì cắt ở dấu phẩy. Module thuần để test
 * đơn vị.
 */
import { splitMarked } from './pinyin';
import { tokText, type ReadTok } from './reader';
import { isHan } from './text';
import { isZhPunct, type TargetChar } from './typing';

/** Một câu (đoạn ngắn) để gõ. */
export interface PassageUnit {
  /** token của câu (không có xuống dòng) */
  toks: ReadTok[];
  /** các chữ Hán và dấu câu tiếng Trung cần gõ, theo thứ tự (dấu câu: âm tiết để trống, chỉ chấm khi bật chấm dấu câu) */
  target: TargetChar[];
  /** vị trí của từng chữ đích: [chỉ số token, chỉ số chữ trong token] */
  at: [number, number][];
  /** câu đầy đủ (để nghe, để hiện) */
  text: string;
  /** câu mở đầu một đoạn mới (sau xuống dòng) */
  para: boolean;
}

/** Số chữ Hán tối đa của một câu trước khi cắt ở dấu phẩy; quá xa không có dấu phẩy thì cắt ở ranh giới từ. */
export const UNIT_SOFT = 16;
export const UNIT_HARD = 36;
/** Độ dài tối đa của đoạn văn để gõ (chữ). */
export const PASSAGE_MAX = 3000;

const END = /[。！？!?…；;]/;
const COMMA = /[，、：,:]/;
const CLOSING = /^[”’》〉」』】）)]$/u;

/** Âm tiết không dấu của từng chữ trong token (theo pinyin của từ); không tách được thì để trống. */
export function tokenSyllables(t: ReadTok): string[] {
  if (t.kind !== 'word' && t.kind !== 'dict') return [];
  const chars = [...t.t];
  const syls = splitMarked(t.p.toLowerCase(), chars.length) ?? splitMarked(t.p.toLowerCase(), chars.length, { lenient: true });
  return syls ? syls.map((s) => s.base) : [];
}

const hanIn = (toks: readonly ReadTok[]) => toks.reduce((n, t) => n + ('t' in t ? [...t.t].filter(isHan).length : 0), 0);

function makeUnit(toks: ReadTok[], para: boolean): PassageUnit {
  const target: TargetChar[] = [];
  const at: [number, number][] = [];
  toks.forEach((t, ti) => {
    if (!('t' in t)) return;
    const chars = [...t.t];
    const syls = tokenSyllables(t);
    chars.forEach((c, ci) => {
      if (isHan(c)) target.push({ c, syl: syls.length === chars.length ? syls[ci] : '' });
      else if (isZhPunct(c)) target.push({ c, syl: '' });
      else return;
      at.push([ti, ci]);
    });
  });
  return { toks, target, at, text: toks.map(tokText).join('').trim(), para };
}

/**
 * Chia văn bản đã tách từ thành câu để gõ: hết câu ở 。！？；… (dấu đóng ngoặc, ngoặc kép ngay sau vẫn thuộc câu
 * trước), xuống dòng là sang đoạn mới; câu dài hơn `soft` chữ thì cắt ở dấu phẩy, dài hơn `hard` chữ mà chưa gặp dấu phẩy
 * thì cắt ở ranh giới từ. Câu không có chữ Hán nào thì bỏ.
 */
export function splitUnits(toks: readonly ReadTok[], soft = UNIT_SOFT, hard = UNIT_HARD): PassageUnit[] {
  const raw: { toks: ReadTok[]; para: boolean }[] = [];
  let cur: ReadTok[] = [];
  let para = true;
  const flush = (nextPara = false) => {
    while (cur.length && cur[0].kind === 'space') cur.shift();
    while (cur.length && cur[cur.length - 1].kind === 'space') cur.pop();
    if (cur.length) raw.push({ toks: cur, para });
    if (cur.length || nextPara) para = nextPara || false;
    cur = [];
  };
  for (const t of toks) {
    if (t.kind === 'break') {
      flush(true);
      continue;
    }
    // dấu đóng ngay sau dấu hết câu: thuộc câu trước
    if (!cur.length && raw.length && t.kind === 'punct' && CLOSING.test(t.t) && !para) {
      raw[raw.length - 1].toks.push(t);
      continue;
    }
    cur.push(t);
    const n = hanIn(cur);
    if (t.kind === 'punct' && END.test(t.t)) flush();
    else if (t.kind === 'punct' && COMMA.test(t.t) && n >= soft) flush();
    else if (n >= hard && t.kind !== 'punct') flush();
  }
  flush();
  // phần không có chữ Hán (dấu câu thừa: ？！, ……) gộp vào câu trước cùng đoạn; đứng đầu đoạn thì gộp vào câu sau và
  // giữ dấu mở đoạn
  const merged: { toks: ReadTok[]; para: boolean }[] = [];
  let pend: ReadTok[] = [];
  let pendPara = false;
  for (const r of raw) {
    if (!hanIn(r.toks)) {
      if (merged.length && !r.para && !pend.length) merged[merged.length - 1].toks.push(...r.toks);
      else {
        pend.push(...r.toks);
        pendPara ||= r.para;
      }
      continue;
    }
    merged.push({ toks: [...pend, ...r.toks], para: r.para || pendPara });
    pend = [];
    pendPara = false;
  }
  if (pend.length && merged.length) merged[merged.length - 1].toks.push(...pend);
  return merged.map((r) => makeUnit(r.toks, r.para));
}

/** Văn bản dán vào: bỏ khoảng trắng thừa ở đầu, cuối từng dòng, bỏ dòng trống liền nhau, cắt bớt nếu quá dài. */
export function tidyPassage(raw: string, max = PASSAGE_MAX): string {
  const lines = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim());
  const out: string[] = [];
  for (const l of lines) if (l || (out.length && out[out.length - 1])) out.push(l);
  while (out.length && !out[out.length - 1]) out.pop();
  return [...out.join('\n')].slice(0, max).join('');
}

/** Số chữ Hán của văn bản. */
export const hanCount = (s: string) => [...s].filter(isHan).length;

/** Mã của một đoạn văn (băm FNV-1a 32 bit): cùng văn bản thì cùng mã, để nhớ tiến độ. */
export function passageId(text: string): string {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
