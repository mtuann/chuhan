/**
 * Tiện ích chữ dùng chung: bỏ dấu tiếng Việt, nhãn cấp, từ loại, cấu tạo chữ (IDS).
 */
import type { PackKey, WordRec } from '../schema/data';
import { numberedToMarks } from './pinyin';

/** Chữ thường, bỏ dấu, đ → d, gộp khoảng trắng: "Đại Học" → "dai hoc". Dùng để so khớp không cần gõ dấu. */
export function foldVi(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dấu thanh tiếng Việt (tổ hợp) → số: sắc 1, huyền 2, hỏi 3, ngã 4, nặng 5. */
const VI_TONE: Record<string, string> = { '\u0301': '1', '\u0300': '2', '\u0309': '3', '\u0303': '4', '\u0323': '5' };

/**
 * Dạng chuẩn để so khớp tiếng Việt có dấu mà không phụ thuộc kiểu bỏ dấu cũ/mới:
 * "Hoá học" và "hóa học" đều thành "hoa1 hoc5". Giữ ă â ê ô ơ ư đ, bỏ dấu câu.
 */
export function viCanon(s: string): string {
  const out: string[] = [];
  for (const tok of s.toLowerCase().normalize('NFC').split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (!tok) continue;
    let tone = '';
    const base = tok
      .normalize('NFD')
      .replace(/[\u0300\u0301\u0303\u0309\u0323]/g, (m) => {
        tone ||= VI_TONE[m];
        return '';
      })
      .normalize('NFC');
    out.push(base + tone);
  }
  return out.join(' ');
}

/** Như `foldVi` nhưng dấu câu cũng thành khoảng trắng, để so khớp nguyên cụm từ. */
export const foldWords = (s: string) => foldVi(s.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' '));

export const isHan = (c: string) => /\p{Script=Han}/u.test(c);

/** Nhãn cấp HSK 2025: 1–6, 7 là nhóm 7–9. */
export function levelLabel(level: number | undefined): string {
  if (!level) return 'Ngoài HSK 2025';
  return level === 7 ? 'Cấp 7–9' : `HSK ${level}`;
}

/** Khoá gói dữ liệu của một cấp (0/undefined → 'x'). */
export function packKey(level: number | undefined): PackKey {
  return level ? (String(level) as PackKey) : 'x';
}

/** Từ loại theo đề cương (chữ Hán) → tiếng Việt. */
const POS_VI: Record<string, string> = {
  名: 'danh từ',
  动: 'động từ',
  形: 'tính từ',
  副: 'phó từ',
  量: 'lượng từ',
  连: 'liên từ',
  代: 'đại từ',
  介: 'giới từ',
  助: 'trợ từ',
  数: 'số từ',
  数量: 'số lượng từ',
  叹: 'thán từ',
  前缀: 'tiền tố',
  后缀: 'hậu tố',
  拟声: 'tượng thanh',
};
export const posLabel = (p: string) => POS_VI[p] ?? p;

/** Loại chữ (Make Me a Hanzi) → tên Việt. */
export const ETYMOLOGY_VI = {
  pictographic: 'chữ tượng hình',
  ideographic: 'chữ hội ý / chỉ sự',
  pictophonetic: 'chữ hình thanh',
} as const;

/** Các bộ kiện trong chuỗi IDS (bỏ ký hiệu bố cục ⿰…⿻ và "？"): "⿰女子" → ["女", "子"]. */
export function idsComponents(ids: string | undefined): string[] {
  if (!ids) return [];
  const out: string[] = [];
  for (const ch of ids) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x2ff0 && cp <= 0x2fff) continue; // ký hiệu mô tả bố cục
    if (ch === '？' || ch === '?') continue;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Định dạng số kiểu Việt: 1234 → "1.234". */
export const fmtInt = (n: number) => n.toLocaleString('vi-VN');

/** Phần trăm kiểu Việt, một chữ số thập phân: 98.7 → "98,7%". */
export const fmtPct = (x: number) => `${x.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Một tham chiếu kiểu CC-CEDICT trong nghĩa: chữ (phồn|giản) kèm pinyin số, ví dụ 您[nin2], 對|对[dui4]. */
const HAN_REF = /([\p{Script=Han}|]+)\[([A-Za-z:0-9 ]+)\]/gu;
/** Chú thích lượng từ trong ngoặc: (个[ge4]), (LT:家[jia1]), (lượng từ: 座[zuo4]). */
const MW_NOTE = /\s*\((?:LT|lượng từ)?\s*:?\s*[\p{Script=Han}|]+\[[^\]]+\](?:\s*[,，、]\s*[\p{Script=Han}|]+\[[^\]]+\])*\)/gu;

/**
 * Nghĩa gọn để hiện trên thẻ và làm đáp án: bỏ chú thích lượng từ, bỏ pinyin số sau chữ được nhắc tới
 * (您[nin2] → 您, dạng phồn|giản lấy chữ giản thể), pinyin số đứng riêng đổi sang dấu ([nei4] → nèi).
 */
export function tidyGloss(g: string): string {
  return g
    .replace(MW_NOTE, '')
    .replace(HAN_REF, (_, han: string) => han.slice(han.lastIndexOf('|') + 1))
    .replace(/\[([A-Za-z:0-9 ]+)\]/g, (_, py: string) => numberedToMarks(py))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nghĩa ngắn để hiện trên thẻ và làm đáp án: nghĩa Việt đầu tiên, bỏ phần trong ngoặc ở đầu và tham chiếu kiểu từ điển. */
export function shortGloss(vi: readonly string[] | undefined, en?: readonly string[]): string {
  const g = vi?.find((x) => x.replace(/^\([^)]*\)\s*/, '').trim()) ?? en?.[0] ?? '';
  const t = tidyGloss(g.replace(/^\([^)]*\)\s*/, '').trim() || g);
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}

/** Nghĩa ngắn nhất của một từ (danh sách, gợi ý): nghĩa đầu tiên của từ điển. */
export function wordGloss(w: Pick<WordRec, 'vi' | 'en'>): string {
  return shortGloss(w.vi, w.en);
}

/** Chuỗi Hán Việt của từ (cách đọc đầu của từng âm tiết), ví dụ "học sinh". */
export function hvString(w: Pick<WordRec, 'hv'>): string {
  return (w.hv ?? [])
    .map((r) => r?.[0])
    .filter(Boolean)
    .join(' ');
}
