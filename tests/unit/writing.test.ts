import { cellReadings } from '../../src/lib/writing';
import type { ReadTok } from '../../src/lib/reader';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrokeRunner, type CharAnim, type CharState } from '../../src/lib/stroke-runner';
import {
  boxesPerRow,
  lastWrites,
  mainHanviet,
  mainReadings,
  orderBoxMm,
  orderRows,
  practiceQueue,
  practiceRow,
  splitCells,
  uniqueHan,
  writeCounts,
  type LastWrite,
} from '../../src/lib/writing';

describe('tách văn bản thành ô', () => {
  it('chữ Hán, dấu câu, khoảng trắng, xuống dòng', () => {
    const { cells, han, cut } = splitCells('我们  学习。\n\n\n你好 A1！ ');
    expect(han).toEqual(['我', '们', '学', '习', '你', '好']);
    expect(cut).toBe(false);
    expect(cells.map((c) => (c.kind === 'han' || c.kind === 'other' ? c.c : c.kind))).toEqual(['我', '们', 'space', '学', '习', '。', 'break', '你', '好', 'space', 'A', '1', '！']);
    expect(cells.filter((c) => c.kind === 'han').map((c) => (c.kind === 'han' ? c.i : -1))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('cắt ở số chữ Hán tối đa; chữ trùng chỉ lấy một lần', () => {
    const r = splitCells('一二三四五', 3);
    expect(r.han).toEqual(['一', '二', '三']);
    expect(r.cut).toBe(true);
    expect(uniqueHan('学习，学生 ok')).toEqual(['学', '习', '生']);
  });
});

describe('thông tin chữ khi tập viết và in', () => {
  it('cách đọc chính là cách đọc có âm Hán Việt; không có thì cách đầu', () => {
    expect(mainReadings({ py: ['ren2', 'en2', 'reng2'], hv: { ren2: ['nhân'] } })).toEqual(['ren2']);
    expect(mainReadings({ py: ['liao3', 'le5'], hv: { le5: ['liễu'], liao3: ['liễu'], liao4: ['liêu'] } })).toEqual(['liao3', 'le5']);
    expect(mainReadings({ py: ['yi1', 'yi2'], hv: { '*': ['nhất'] } })).toEqual(['yi1']);
    expect(mainHanviet({ py: ['liao3', 'le5'], hv: { le5: ['liễu'], liao3: ['liễu'], liao4: ['liêu'] } })).toEqual(['liễu']);
    expect(mainHanviet({ py: ['yi1', 'yi2'], hv: { '*': ['nhất'] } })).toEqual(['nhất']);
    expect(mainReadings(undefined)).toEqual([]);
  });
});

describe('tập viết', () => {
  const at = (c: string, grade: string, t: number) => ({ itemId: c, at: t, data: { grade } });
  it('kết quả gần nhất của từng chữ', () => {
    const m = lastWrites([at('一', 'again', 1), at('一', 'good', 3), at('二', 'hard', 2), at('二', 'xx', 9), { itemId: '三', at: 5 }]);
    expect(m.get('一')).toEqual({ grade: 'good', at: 3 });
    expect(m.get('二')).toEqual({ grade: 'hard', at: 2 });
    expect(m.has('三')).toBe(false);
  });

  it('lượt luyện tiếp theo: tối đa 3 chữ sai, rồi chữ mới, rồi chữ còn lỗi; đúng hết thì ôn chữ lâu nhất', () => {
    const list = ['一', '二', '三', '四', '五', '六', '七', '八'];
    const last = new Map<string, LastWrite>([
      ['一', { grade: 'good', at: 1 }],
      ['二', { grade: 'again', at: 2 }],
      ['三', { grade: 'hard', at: 3 }],
      ['四', { grade: 'again', at: 4 }],
      ['五', { grade: 'again', at: 5 }],
      ['六', { grade: 'again', at: 6 }],
    ]);
    expect(practiceQueue(list, last, 5)).toEqual(['二', '四', '五', '七', '八']);
    expect(practiceQueue(list, last, 10)).toEqual(['二', '四', '五', '七', '八', '三', '六']);
    const allGood = new Map<string, LastWrite>(list.map((c, i) => [c, { grade: 'good', at: 10 - i }]));
    expect(practiceQueue(list, allGood, 2)).toEqual(['八', '七']);
    expect(writeCounts(list, last)).toEqual({ good: 1, hard: 1, again: 4, none: 2 });
  });
});

describe('trang in 田字格', () => {
  it('số ô một hàng, hàng luyện, hàng thứ tự nét', () => {
    expect(boxesPerRow(15)).toBe(12);
    expect(boxesPerRow(18)).toBe(10);
    expect(boxesPerRow(12)).toBe(15);
    expect(practiceRow(0, 6, 3)).toEqual(['model', 'faded', 'faded', 'faded', 'empty', 'empty']);
    expect(practiceRow(1, 3, 3)).toEqual(['empty', 'empty', 'empty']);
    expect(orderRows(5, 3)).toEqual([[1, 2, 3], [4, 5]]);
    expect(orderBoxMm(15)).toBe(9);
    expect(orderBoxMm(20)).toBe(10);
  });
});

// ---------------------------------------------------------------- điều phối animation

/** Ô giả: viết mất `dur` ms (tính theo thời gian không dừng); lệnh mới huỷ lượt đang viết, như Hanzi Writer. */
function fake(name: string, dur: number, log: string[]): CharAnim & { paused: boolean } {
  let cancel: (() => void) | null = null;
  const self = {
    paused: false,
    animate() {
      cancel?.();
      log.push(`${name}+`);
      return new Promise<void>((resolve) => {
        let left = dur;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          cancel = null;
          resolve();
        };
        cancel = finish;
        const step = () => {
          if (done) return;
          if (!self.paused) left -= 10;
          if (left <= 0) {
            log.push(`${name}.`);
            finish();
          } else setTimeout(step, 10);
        };
        setTimeout(step, 10);
      });
    },
    hide() {
      cancel?.();
    },
    show() {
      cancel?.();
    },
    pause() {
      self.paused = true;
    },
    resume() {
      self.paused = false;
    },
  };
  return self;
}

describe('điều phối animation cả câu', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const timing = { charGap: 100, endPause: 300, loopPause: 200 };

  it('Lần lượt: chữ sau chỉ bắt đầu khi chữ trước viết xong, từ trái qua phải, xong câu thì chạy lại', async () => {
    const log: string[] = [];
    const states: string[] = [];
    const r = new StrokeRunner(3, { onState: (i, s: CharState) => states.push(`${i}${s}`) }, timing);
    r.set(0, fake('a', 200, log));
    r.set(1, fake('b', 100, log));
    r.set(2, fake('c', 100, log));
    r.play('sequence');
    await vi.advanceTimersByTimeAsync(150);
    expect(log).toEqual(['a+']);
    expect(r.active).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(log).toEqual(['a+', 'a.', 'b+', 'b.', 'c+', 'c.']);
    expect(states.slice(0, 3)).toEqual(['0cho', '1cho', '2cho']);
    // a 0–200, nghỉ, b 300–400, nghỉ, c 500–600, nghỉ cuối câu 300 → chạy lại lúc 900
    await vi.advanceTimersByTimeAsync(200);
    expect(log.slice(6)).toEqual(['a+']);
  });

  it('Đồng loạt: mọi chữ cùng bắt đầu, mỗi chữ lặp độc lập', async () => {
    const log: string[] = [];
    const loops = new Map<number, number>();
    const r = new StrokeRunner(2, { onLoop: (i, n) => loops.set(i, n) }, timing);
    r.set(0, fake('a', 100, log));
    r.set(1, fake('b', 500, log));
    r.play('together');
    await vi.advanceTimersByTimeAsync(20);
    expect(log).toEqual(['a+', 'b+']);
    await vi.advanceTimersByTimeAsync(1500);
    expect(loops.get(0)).toBeGreaterThanOrEqual(4);
    expect(loops.get(1)).toBe(2);
  });

  it('dừng: không chữ nào chạy tiếp, chạy tiếp thì viết nốt', async () => {
    const log: string[] = [];
    const r = new StrokeRunner(2, {}, timing);
    r.set(0, fake('a', 200, log));
    r.set(1, fake('b', 200, log));
    r.play('together');
    await vi.advanceTimersByTimeAsync(50);
    r.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual(['a+', 'b+']);
    r.resume();
    await vi.advanceTimersByTimeAsync(200);
    expect(log).toEqual(['a+', 'b+', 'a.', 'b.']);
  });

  it('Đồng loạt: chữ ngoài màn hình tạm dừng', async () => {
    const log: string[] = [];
    const r = new StrokeRunner(2, {}, timing);
    const b = fake('b', 200, log);
    r.set(0, fake('a', 200, log));
    r.set(1, b);
    r.play('together');
    await vi.advanceTimersByTimeAsync(50);
    r.setVisible(1, false);
    expect(b.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(log.filter((x) => x.startsWith('b'))).toEqual(['b+']);
    r.setVisible(1, true);
    await vi.advanceTimersByTimeAsync(200);
    expect(log).toContain('b.');
  });

  it('chạm vào chữ: Lần lượt chạy lại từ chữ đó; chữ chưa tải thì chờ, chữ không có nét thì bỏ qua', async () => {
    const log: string[] = [];
    const states = new Map<number, string>();
    const r = new StrokeRunner(4, { onState: (i, s) => states.set(i, s) }, timing);
    r.set(0, fake('a', 100, log));
    r.play('sequence');
    await vi.advanceTimersByTimeAsync(500);
    expect(log).toEqual(['a+', 'a.']);
    expect(r.active).toBe(1);
    r.set(1, null);
    r.set(3, fake('d', 100, log));
    await vi.advanceTimersByTimeAsync(50);
    expect(r.active).toBe(2);
    r.restartFrom(3);
    await vi.advanceTimersByTimeAsync(50);
    expect(states.get(0)).toBe('xong');
    expect(states.get(2)).toBe('xong');
    expect(log).toEqual(['a+', 'a.', 'd+']);
  });
});

describe('pinyin từng ô chữ (Xem cách viết)', () => {
  const w = (t: string, p: string, hv = '', alt = false): ReadTok => ({ kind: 'word', t, p, ids: [`${t}_x`], lv: 1, hv, m: 'nghĩa', alt, tone: 0 });

  it('chữ đa âm lấy cách đọc theo từ chứa nó; Hán Việt theo từng chữ', () => {
    const toks: ReadTok[] = [w('我', 'wǒ', 'ngã'), w('去', 'qù', 'khứ'), w('银行', 'yínháng', 'ngân hàng'), { kind: 'punct', t: '。' }];
    const r = cellReadings(toks, splitCells('我去银行。').han.length);
    expect(r.map((x) => x?.p)).toEqual(['wǒ', 'qù', 'yín', 'háng']);
    expect(r[3]).toMatchObject({ tone: 2, hv: 'hàng', word: '银行', wordP: 'yínháng', tok: 2 });
  });

  it('儿 hoá thành âm r; chữ không có trong từ điển: null; dấu câu, khoảng trắng bỏ qua', () => {
    const toks: ReadTok[] = [w('一点儿', 'yìdiǎnr', '', true), { kind: 'space' }, { kind: 'char', t: '㐀' }, w('好', 'hǎo')];
    const r = cellReadings(toks, 5);
    expect(r.map((x) => x?.p ?? null)).toEqual(['yì', 'diǎn', 'r', null, 'hǎo']);
    expect(r[0]).toMatchObject({ alt: true, tone: 4 });
  });

  it('tên riêng giữ chữ hoa; dừng ở số chữ tối đa', () => {
    const toks: ReadTok[] = [{ kind: 'dict', t: '北京', p: 'Běijīng', m: ['Bắc Kinh'], proper: true, tone: 0, alt: false }, w('好', 'hǎo')];
    expect(cellReadings(toks, 2).map((x) => x?.p)).toEqual(['Běi', 'jīng']);
  });
});
