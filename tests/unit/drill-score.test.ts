/**
 * Tích luỹ kết quả lượt luyện gõ (src/lib/typing.ts: scoreFirstCheck),
 * rút từ hàm `check` trong src/app/typing/Drill.tsx.
 */
import { describe, expect, it } from 'vitest';
import {
  FIRST_CHECK_MAX_MS,
  scoreFirstCheck,
  type CheckResult,
  type DrillScore,
} from '../../src/lib/typing';

const empty: DrillScore = { right: 0, chars: 0, ms: 0, errors: [] };
const check = (cells: CheckResult['cells'], right: number, total: number): CheckResult => ({
  cells,
  right,
  total,
  ok: right === total && cells.length === total,
});

describe('scoreFirstCheck', () => {
  it('cộng số chữ đúng, tổng số chữ, thời gian và lỗi theo ô', () => {
    const r = check(
      [
        { kind: 'ok', t: '我', got: '我' },
        { kind: 'dong-am', t: '在', got: '再', hint: { key: 'zh/z', tip: 'zh uốn lưỡi' } },
        { kind: 'thieu', t: '家' },
      ],
      1,
      3,
    );
    const { score, missed } = scoreFirstCheck({ right: 5, chars: 10, ms: 1000, errors: [] }, r, 5000, 2000);
    expect(score).toEqual({
      right: 6,
      chars: 13,
      ms: 4000,
      errors: [
        { kind: 'dong-am', t: '在', got: '再', key: 'zh/z' },
        { kind: 'thieu', t: '家', got: undefined, key: undefined },
      ],
    });
    expect(missed).toBe(true);
  });

  it('đề đúng hết thì missed = false', () => {
    const r = check([{ kind: 'ok', t: '我', got: '我' }], 1, 1);
    const { score, missed } = scoreFirstCheck(empty, r, 2000, 1000);
    expect(missed).toBe(false);
    expect(score.right).toBe(1);
    expect(score.errors).toEqual([]);
  });

  it('thời gian một đề bị trần 5 phút (người học bỏ dở rồi quay lại)', () => {
    expect(FIRST_CHECK_MAX_MS).toBe(5 * 60_000);
    const r = check([{ kind: 'ok', t: '我', got: '我' }], 1, 1);
    const { score } = scoreFirstCheck(empty, r, 1000 + 30 * 60_000, 1000);
    expect(score.ms).toBe(5 * 60_000);
  });

  it('thuần: không sửa bộ cũ', () => {
    const prev: DrillScore = { right: 1, chars: 2, ms: 500, errors: [{ kind: 'thua', got: '的' }] };
    const r = check([{ kind: 'sai-am', t: '好', got: '号' }], 0, 1);
    const { score } = scoreFirstCheck(prev, r, 1500, 1000);
    expect(prev).toEqual({ right: 1, chars: 2, ms: 500, errors: [{ kind: 'thua', got: '的' }] });
    expect(score.errors).toHaveLength(2);
    expect(score.errors[0]).toEqual({ kind: 'thua', got: '的' });
  });
});
