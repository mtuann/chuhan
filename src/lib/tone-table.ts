// Tệp sinh tự động bởi scripts/data/main.ts (npm run data). Không sửa tay.
// Bảng đo "mẹo thanh Hán Việt" trên các cặp (chữ phồn thể, pinyin, âm Hán Việt) của 3.088 chữ đọc HSK 2025.
// accuracy: % cặp có thanh đúng như dự đoán (nhóm không đoán được: % của thanh phổ biến nhất); dist: % theo thanh 1–5.
import type { ToneRuleId } from './hanviet';

export const TONE_TABLE: Readonly<Record<ToneRuleId, { accuracy: number; n: number; dist: readonly number[] }>> = {
  'ngang-khac': { accuracy: 89.5, n: 711, dist: [89.5, 3.4, 2.5, 3.9, 0.7] },
  'ngang-vang': { accuracy: 80.2, n: 298, dist: [10.4, 80.2, 3.4, 3.4, 2.7] },
  huyen: { accuracy: 80.1, n: 412, dist: [10.2, 80.1, 2.7, 6.8, 0.2] },
  hoi: { accuracy: 83.8, n: 402, dist: [5.0, 0.7, 83.8, 10.2, 0.2] },
  'nga-vang': { accuracy: 88.8, n: 134, dist: [0.0, 0.7, 88.8, 10.4, 0.0] },
  'nga-khac': { accuracy: 63.6, n: 66, dist: [6.1, 3.0, 27.3, 63.6, 0.0] },
  sac: { accuracy: 82.6, n: 558, dist: [6.1, 1.3, 9.9, 82.6, 0.2] },
  nang: { accuracy: 86.2, n: 448, dist: [1.3, 4.2, 8.0, 86.2, 0.2] },
  'nang-tac-vang': { accuracy: 84.6, n: 117, dist: [6.0, 2.6, 3.4, 84.6, 3.4] },
  'nang-tac-khac': { accuracy: 63.9, n: 158, dist: [8.9, 63.9, 2.5, 24.1, 0.6] },
  'sac-tac': { accuracy: 35.6, n: 331, dist: [33.8, 18.4, 11.2, 35.6, 0.9] },
};

// Vần cuối: âm Hán Việt tận cùng -m, -n, -ng/-nh → % cặp có pinyin tận cùng -n (toN) và -ng (toNg); n: số cặp.
export const TONE_FINALS: Readonly<Record<'m' | 'n' | 'ng/nh', { n: number; toN: number; toNg: number }>> = {
  m: { n: 79, toN: 98.7, toNg: 0.0 },
  n: { n: 270, toN: 96.7, toNg: 1.1 },
  'ng/nh': { n: 336, toN: 2.7, toNg: 97.0 },
};
