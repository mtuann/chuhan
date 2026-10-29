/**
 * Chấm bài viết chữ theo spec F5: m lỗi trên một chữ n nét.
 * m = 0 → Nhớ (Good); 1 ≤ m ≤ max(2, ⌊0,2n⌋) → Khó (Hard); nhiều hơn, hoặc đã phải hiện gợi ý → Quên (Again).
 */
export type WriteGrade = 'good' | 'hard' | 'again';

export function gradeWriting(mistakes: number, strokes: number, hintShown: boolean): WriteGrade {
  if (hintShown) return 'again';
  if (mistakes === 0) return 'good';
  if (mistakes <= Math.max(2, Math.floor(0.2 * strokes))) return 'hard';
  return 'again';
}

export const GRADE_VI: Record<WriteGrade, string> = { good: 'Nhớ', hard: 'Khó', again: 'Quên' };
