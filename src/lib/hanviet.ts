/**
 * Mẹo đoán thanh pinyin từ âm Hán Việt. Đây là mẹo nhớ, không phải cách đọc.
 *
 * Quy luật dựa trên nguồn gốc chung của hai hệ thanh (thanh và phụ âm đầu thời Trung cổ):
 * - thanh ngang: phụ âm đầu không vang → thanh 1; phụ âm đầu vang (m, n, nh, ng/ngh, l, v, d) → thanh 2;
 * - huyền → 2; hỏi → 3; ngã → 3 nếu phụ âm đầu vang, còn lại thường là 4;
 * - sắc, nặng (âm không tắc) → 4;
 * - âm tắc (kết thúc bằng -p, -t, -c, -ch): nặng + phụ âm vang → 4, nặng + phụ âm khác → 2, sắc → không đoán được.
 *
 * Độ chính xác đo trên các cặp (chữ phồn thể, pinyin, âm Hán Việt) của 3.088 chữ đọc HSK 2025.
 * Pipeline dữ liệu đo lại mỗi lần chạy và ghi vào tone-table.ts (xem scripts/data/tones.ts).
 */
import { TONE_TABLE } from './tone-table';

export type HvTone = 'ngang' | 'huyen' | 'hoi' | 'nga' | 'sac' | 'nang';

export type ToneRuleId =
  | 'ngang-khac'
  | 'ngang-vang'
  | 'huyen'
  | 'hoi'
  | 'nga-vang'
  | 'nga-khac'
  | 'sac'
  | 'nang'
  | 'nang-tac-vang'
  | 'nang-tac-khac'
  | 'sac-tac';

export interface ToneRule {
  id: ToneRuleId;
  /** Mô tả ngắn cho người học. */
  label: string;
  /** Thanh pinyin dự đoán; `null` khi nhóm này không đoán được. */
  predict: 1 | 2 | 3 | 4 | null;
  /** Tỉ lệ (%) cặp trong nhóm có thanh đúng như dự đoán. Với nhóm không đoán được: tỉ lệ của thanh phổ biến nhất. */
  accuracy: number;
  /** Số cặp đã đo. */
  n: number;
}

/** Định nghĩa nhóm; độ chính xác và số cặp lấy từ bảng đo (tone-table.ts, do pipeline dữ liệu sinh ra). */
const RULE_DEFS: Record<ToneRuleId, { label: string; predict: ToneRule['predict'] }> = {
  'ngang-khac': { label: 'thanh ngang, phụ âm đầu không vang', predict: 1 },
  'ngang-vang': { label: 'thanh ngang, phụ âm đầu vang (m, n, nh, ng, l, v, d)', predict: 2 },
  huyen: { label: 'thanh huyền', predict: 2 },
  hoi: { label: 'thanh hỏi', predict: 3 },
  'nga-vang': { label: 'thanh ngã, phụ âm đầu vang', predict: 3 },
  'nga-khac': { label: 'thanh ngã, phụ âm đầu không vang', predict: 4 },
  sac: { label: 'thanh sắc, không tận cùng bằng p/t/c/ch', predict: 4 },
  nang: { label: 'thanh nặng, không tận cùng bằng p/t/c/ch', predict: 4 },
  'nang-tac-vang': { label: 'thanh nặng, tận cùng p/t/c/ch, phụ âm đầu vang', predict: 4 },
  'nang-tac-khac': { label: 'thanh nặng, tận cùng p/t/c/ch, phụ âm đầu không vang', predict: 2 },
  'sac-tac': { label: 'thanh sắc, tận cùng p/t/c/ch', predict: null },
};

export const TONE_RULE_IDS = Object.keys(RULE_DEFS) as ToneRuleId[];

export const TONE_RULES: Readonly<Record<ToneRuleId, ToneRule>> = Object.fromEntries(
  TONE_RULE_IDS.map((id) => [id, { id, ...RULE_DEFS[id], accuracy: TONE_TABLE[id].accuracy, n: TONE_TABLE[id].n }]),
) as Record<ToneRuleId, ToneRule>;

const TONE_MARK: Record<string, HvTone> = { '\u0301': 'sac', '\u0300': 'huyen', '\u0309': 'hoi', '\u0303': 'nga', '\u0323': 'nang' };

/** Bỏ dấu thanh và dấu phụ, chữ thường: "Đường" → "đuong" (đ là chữ riêng, NFD không tách). */
function skeleton(syllable: string): string {
  return syllable
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Thanh của âm tiết Hán Việt. */
export function hvToneOf(syllable: string): HvTone {
  for (const c of syllable.normalize('NFD')) {
    const t = TONE_MARK[c];
    if (t) return t;
  }
  return 'ngang';
}

/** Phụ âm đầu vang: m, n, nh, ng, ngh, l, v, d (không tính đ và gi). */
export function isSonorantInitial(syllable: string): boolean {
  const s = skeleton(syllable);
  if (s.startsWith('gi')) return false;
  return /^(ngh|ng|nh|m|n|l|v|d)/.test(s);
}

/** Âm tắc: tận cùng bằng p, t, c, ch. */
export function isChecked(syllable: string): boolean {
  return /(p|t|c|ch)$/.test(skeleton(syllable));
}

export function toneRuleOf(syllable: string): ToneRuleId {
  const tone = hvToneOf(syllable);
  const son = isSonorantInitial(syllable);
  switch (tone) {
    case 'ngang':
      return son ? 'ngang-vang' : 'ngang-khac';
    case 'huyen':
      return 'huyen';
    case 'hoi':
      return 'hoi';
    case 'nga':
      return son ? 'nga-vang' : 'nga-khac';
    case 'sac':
      return isChecked(syllable) ? 'sac-tac' : 'sac';
    case 'nang':
      if (!isChecked(syllable)) return 'nang';
      return son ? 'nang-tac-vang' : 'nang-tac-khac';
  }
}

export interface ToneHint {
  rule: ToneRule;
  /** Có khi biết thanh thật: thanh thật có đúng như mẹo không. `undefined` nếu nhóm không đoán được. */
  fits?: boolean;
}

/** Gợi ý thanh cho một âm Hán Việt; `actualTone` (1–5) là thanh pinyin thật nếu đã biết. */
export function toneHint(hv: string, actualTone?: number): ToneHint {
  const rule = TONE_RULES[toneRuleOf(hv)];
  if (actualTone === undefined || rule.predict === null) return { rule };
  return { rule, fits: actualTone === rule.predict };
}

/** Mẹo vần cuối: Hán Việt -m/-n → pinyin -n; -ng/-nh → pinyin -ng. */
export function finalHint(hv: string): 'n' | 'ng' | null {
  const s = skeleton(hv);
  if (/(ng|nh)$/.test(s)) return 'ng';
  if (/[mn]$/.test(s)) return 'n';
  return null;
}
