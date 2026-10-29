/**
 * Đo lại bảng "mẹo thanh Hán Việt" trên chữ HSK 2025 và so với hằng số trong src/lib/hanviet.ts.
 */
import { TONE_RULES, toneRuleOf, type ToneRuleId } from '../../src/lib/hanviet.ts';
import type { HanvietIndex } from './build.ts';

export interface ToneRow {
  id: ToneRuleId;
  n: number;
  /** % theo thanh 1–5 */
  dist: [number, number, number, number, number];
  predict: number | null;
  accuracy: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * @param chars chữ HSK 2025 (giản thể) và các dạng phồn thể của chữ đó
 * @param singleTone thanh của chữ khi dòng Hán Việt không gắn pinyin (*): chỉ dùng nếu chữ có đúng 1 cách đọc
 */
export function measureTones(
  chars: { c: string; forms: string[] }[],
  hv: HanvietIndex,
  singleTone: (form: string) => number | null,
) {
  const tab = new Map<ToneRuleId, number[]>();
  const finals = { m: [0, 0, 0], n: [0, 0, 0], ngnh: [0, 0, 0] }; // [→n, →ng, khác]
  const seen = new Set<string>();
  for (const { forms } of chars) {
    for (const f of forms) {
      if (seen.has(f)) continue;
      seen.add(f);
      for (const row of hv.rows.get(f) ?? []) {
        let tone: number | null;
        let base: string;
        if (row.key === '*') {
          tone = singleTone(f);
          base = '';
        } else {
          tone = Number(row.key.slice(-1));
          base = row.key.slice(0, -1);
        }
        if (!tone) continue;
        for (const r of row.readings) {
          const id = toneRuleOf(r.toLowerCase());
          const counts = tab.get(id) ?? [0, 0, 0, 0, 0];
          counts[tone - 1]++;
          tab.set(id, counts);
          if (base) {
            const skel = r.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const bucket = /(ng|nh)$/.test(skel) ? finals.ngnh : /m$/.test(skel) ? finals.m : /n$/.test(skel) ? finals.n : null;
            if (bucket) bucket[base.endsWith('ng') ? 1 : base.endsWith('n') ? 0 : 2]++;
          }
        }
      }
    }
  }
  const rows: ToneRow[] = [];
  for (const id of Object.keys(TONE_RULES) as ToneRuleId[]) {
    const c = tab.get(id) ?? [0, 0, 0, 0, 0];
    const n = c.reduce((a, b) => a + b, 0);
    const dist = c.map((x) => (n ? round1((100 * x) / n) : 0)) as ToneRow['dist'];
    const rule = TONE_RULES[id];
    const accuracy = rule.predict ? dist[rule.predict - 1] : Math.max(...dist);
    rows.push({ id, n, dist, predict: rule.predict, accuracy });
  }
  const pct = (b: number[]) => {
    const t = b.reduce((x, y) => x + y, 0);
    return { n: t, toN: t ? round1((100 * b[0]) / t) : 0, toNg: t ? round1((100 * b[1]) / t) : 0 };
  };
  return { rows, finals: { m: pct(finals.m), n: pct(finals.n), 'ng/nh': pct(finals.ngnh) } };
}

export interface FinalStat {
  n: number;
  toN: number;
  toNg: number;
}

/** Nội dung src/lib/tone-table.ts sinh từ số đo (tệp này được commit; CI báo nếu khác). */
export function renderToneTable(rows: ToneRow[], finals: Record<'m' | 'n' | 'ng/nh', FinalStat>): string {
  const lines = rows.map((r) => `  ${/-/.test(r.id) ? `'${r.id}'` : r.id}: { accuracy: ${r.accuracy.toFixed(1)}, n: ${r.n}, dist: [${r.dist.map((x) => x.toFixed(1)).join(', ')}] },`);
  return [
    '// Tệp sinh tự động bởi scripts/data/main.ts (npm run data). Không sửa tay.',
    '// Bảng đo "mẹo thanh Hán Việt" trên các cặp (chữ phồn thể, pinyin, âm Hán Việt) của 3.088 chữ đọc HSK 2025.',
    '// accuracy: % cặp có thanh đúng như dự đoán (nhóm không đoán được: % của thanh phổ biến nhất); dist: % theo thanh 1–5.',
    "import type { ToneRuleId } from './hanviet';",
    '',
    'export const TONE_TABLE: Readonly<Record<ToneRuleId, { accuracy: number; n: number; dist: readonly number[] }>> = {',
    ...lines,
    '};',
    '',
    '// Vần cuối: âm Hán Việt tận cùng -m, -n, -ng/-nh → % cặp có pinyin tận cùng -n (toN) và -ng (toNg); n: số cặp.',
    "export const TONE_FINALS: Readonly<Record<'m' | 'n' | 'ng/nh', { n: number; toN: number; toNg: number }>> = {",
    ...(['m', 'n', 'ng/nh'] as const).map((k) => `  ${k === 'ng/nh' ? `'${k}'` : k}: { n: ${finals[k].n}, toN: ${finals[k].toN.toFixed(1)}, toNg: ${finals[k].toNg.toFixed(1)} },`),
    '};',
    '',
  ].join('\n');
}
