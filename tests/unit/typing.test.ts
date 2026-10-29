import { describe, expect, it } from 'vitest';
import type { SearchRowLike } from '../../src/lib/reader';
import { PUNCT } from '../../src/lib/ime';
import {
  PUNCT_INFO,
  ZH_PUNCT,
  blankOk,
  checkPrefix,
  checkTyped,
  homophoneSets,
  marksOf,
  perMinute,
  punctTip,
  splitSyl,
  summarizeErrors,
  sylHint,
  sylOfId,
  targetChars,
} from '../../src/lib/typing';

const charSyl = new Map<string, Set<string>>([
  ['在', new Set(['zai'])],
  ['再', new Set(['zai'])],
  ['字', new Set(['zi'])],
  ['知', new Set(['zhi'])],
  ['子', new Set(['zi'])],
]);

describe('gõ chữ: chữ đích', () => {
  it('âm tiết theo id từ, tên riêng theo pinyin; bỏ dấu câu', () => {
    expect(sylOfId('学习_xue2xi2')).toEqual(['xue', 'xi']);
    expect(targetChars([['陈安', 'Chén Ān'], ['，'], ['在', 'zài', '在_zai4'], ['学习', 'xuéxí', '学习_xue2xi2'], ['。']])).toEqual([
      { c: '陈', syl: 'chen' },
      { c: '安', syl: 'an' },
      { c: '在', syl: 'zai' },
      { c: '学', syl: 'xue' },
      { c: '习', syl: 'xi' },
    ]);
  });
});

describe('gõ chữ: chấm', () => {
  const T = targetChars([['我', 'wǒ', '我_wo3'], ['在', 'zài', '在_zai4'], ['学校', 'xuéxiào', '学校_xue2xiao4']]);

  it('đúng hết; bỏ qua dấu câu đã gõ', () => {
    const r = checkTyped(T, [...'我在学校。'].map((c) => ({ c })));
    expect(r).toMatchObject({ right: 4, total: 4, ok: true });
  });

  it('chọn nhầm chữ cùng âm (theo âm đã gõ hoặc theo dữ liệu chữ)', () => {
    const r = checkTyped(T, [{ c: '我' }, { c: '再', syl: 'zai' }, { c: '学' }, { c: '校' }]);
    expect(r.ok).toBe(false);
    expect(r.cells[1]).toEqual({ kind: 'dong-am', t: '在', syl: 'zai', got: '再', gotSyl: 'zai' });
    const r2 = checkTyped(T, [...'我再学校'].map((c) => ({ c })), { charSyl });
    expect(r2.cells[1].kind).toBe('dong-am');
  });

  it('gõ sai âm kèm mẹo; thiếu chữ, thừa chữ', () => {
    const t = targetChars([['知', 'zhī', '知_zhi1']]);
    const r = checkTyped(t, [{ c: '子', syl: 'zi' }]);
    expect(r.cells[0]).toMatchObject({ kind: 'sai-am', got: '子', hint: { key: 'zh/z' } });
    const miss = checkTyped(T, [...'我学校'].map((c) => ({ c })));
    expect(miss.cells.map((c) => c.kind)).toEqual(['ok', 'thieu', 'ok', 'ok']);
    expect(miss.right).toBe(3);
    const extra = checkTyped(T, [...'我在在学校'].map((c) => ({ c })));
    expect(extra.cells.filter((c) => c.kind === 'thua')).toHaveLength(1);
    expect(extra.ok).toBe(false);
  });
});

describe('gõ chữ: chấm ngay khi gõ dở (gõ theo đoạn văn), dấu lỗi để sửa tại chỗ', () => {
  const T = targetChars([['我', 'wǒ', '我_wo3'], ['在', 'zài', '在_zai4'], ['学校', 'xuéxiào', '学校_xue2xiao4']]);
  const typed = (s: string) => [...s].map((c) => ({ c }));

  it('phần chưa gõ không tính là thiếu; gõ đúng hết là xong', () => {
    expect(checkPrefix(T, [])).toMatchObject({ next: 0, cells: [], ok: false });
    expect(checkPrefix(T, typed('我在'))).toMatchObject({ next: 2, right: 2, ok: false });
    expect(checkPrefix(T, typed('我在学校。'))).toMatchObject({ next: 4, right: 4, ok: true });
  });

  it('chọn nhầm chữ cuối là chọn nhầm (không phải thừa); bỏ sót một chữ chỉ báo thiếu chữ đó', () => {
    const r = checkPrefix(T, [{ c: '我' }, { c: '再', syl: 'zai' }]);
    expect(r.cells.map((c) => c.kind)).toEqual(['ok', 'dong-am']);
    expect(r.next).toBe(2);
    const skip = checkPrefix(T, typed('我学校'));
    expect(skip.cells.map((c) => c.kind)).toEqual(['ok', 'thieu', 'ok', 'ok']);
    expect(skip.ok).toBe(false);
    const skip2 = checkPrefix(T, typed('我学'));
    expect(skip2.cells.map((c) => c.kind)).toEqual(['ok', 'thieu', 'ok']);
    expect(skip2.next).toBe(3);
  });

  it('hoà điểm: chữ gõ cùng âm là chọn nhầm chữ đó (我是在家 gõ 我再家: thiếu 是, chọn nhầm 在)', () => {
    const t = targetChars([
      ['我', 'wǒ', '我_wo3'],
      ['是', 'shì', '是_shi4'],
      ['在', 'zài', '在_zai4'],
      ['家', 'jiā', '家_jia1'],
    ]);
    const got = [{ c: '我' }, { c: '再', syl: 'zai' }, { c: '家' }];
    expect(checkTyped(t, got).cells.map((c) => c.kind)).toEqual(['ok', 'thieu', 'dong-am', 'ok']);
    expect(checkTyped(t, [...'我再家'].map((c) => ({ c })), { charSyl }).cells.map((c) => c.kind)).toEqual(['ok', 'thieu', 'dong-am', 'ok']);
  });

  it('chữ lặp: sót 天气 trong 今天天气很好 là thiếu hai chữ liền nhau', () => {
    const t = targetChars([
      ['今天', 'jīntiān', '今天_jin1tian1'],
      ['天气', 'tiānqì', '天气_tian1qi4'],
      ['很', 'hěn', '很_hen3'],
      ['好', 'hǎo', '好_hao3'],
    ]);
    const r = checkPrefix(t, typed('今天很好'));
    expect(r.cells.map((c) => c.kind)).toEqual(['ok', 'ok', 'thieu', 'thieu', 'ok', 'ok']);
    expect([...marksOf(r.cells, typed('今天很好')).gaps.entries()]).toEqual([[2, 2]]);
    // mới gõ một chữ sau chỗ sót: tạm coi là chọn nhầm, gõ tiếp thì nhận ra là sót chữ
    expect(checkPrefix(t, typed('今天很')).cells.map((c) => c.kind)).toEqual(['ok', 'ok', 'sai-am']);
  });

  it('dấu lỗi theo vị trí trong chữ đã gõ (kể cả dấu câu): chữ sai, chữ thừa, chỗ thiếu', () => {
    const t1 = [{ c: '我' }, { c: '，' }, { c: '再', syl: 'zai' }, { c: '学' }];
    const m1 = marksOf(checkPrefix(T, t1).cells, t1);
    expect([...m1.bad]).toEqual([2]);
    expect(m1.gaps.size).toBe(0);
    const t2 = typed('我，学校');
    const m2 = marksOf(checkTyped(T, t2).cells, t2);
    expect([...m2.gaps.entries()]).toEqual([[1, 1]]);
    // gõ 在 hai lần: chữ sau là thừa
    const t3 = typed('我在在学校');
    expect([...marksOf(checkTyped(T, t3).cells, t3).extra]).toEqual([2]);
    const t4 = typed('我');
    expect([...marksOf(checkTyped(T, t4).cells, t4).gaps.entries()]).toEqual([[1, 3]]);
  });
});

describe('gõ chữ: mẹo theo lỗi của người Việt', () => {
  it('âm đầu, vần, ü', () => {
    expect(splitSyl('zhong')).toEqual(['zh', 'ong']);
    expect(splitSyl('an')).toEqual(['', 'an']);
    expect(sylHint('shi', 'si').key).toBe('sh/s');
    expect(sylHint('nan', 'lan').key).toBe('l/n');
    expect(sylHint('xi', 'si').key).toBe('j q x');
    expect(sylHint('pa', 'ba').key).toBe('bật hơi');
    expect(sylHint('fang', 'fan').key).toBe('-n/-ng');
    expect(sylHint('nv', 'nu').key).toBe('ü');
    expect(sylHint('hao', 'ma')).toEqual({ key: 'âm khác', tip: 'âm đúng là hao' });
  });
});

describe('gõ chữ: bộ cùng âm, tổng hợp lỗi', () => {
  const row = (id: string, lv: number, hv: string, vi: string, q?: number): SearchRowLike =>
    q ? [id, lv, id.split('_')[1], hv, vi, '', q] : [id, lv, id.split('_')[1], hv, vi, ''];
  it('từ HSK gõ cùng chuỗi pinyin (không dấu thanh), bộ hay gặp trước', () => {
    const sets = homophoneSets(
      [
        row('在_zai4', 1, 'tại', 'ở; tại', 5),
        row('再_zai4', 1, 'tái', 'lại; nữa', 91),
        row('买_mai3', 1, 'mãi', 'mua', 300),
        row('卖_mai4', 1, 'mại', 'bán', 400),
        row('载_zai4', 5, 'tải', 'chở', 3000),
        row('学_xue2', 1, 'học', 'học', 300),
      ],
      2,
    );
    expect(sets.map((s) => s.map((x) => x.t).join('/'))).toEqual(['在/再', '买/卖']);
    expect(sets[0][1]).toMatchObject({ hv: 'tái', m: 'lại' });
  });

  it('tổng hợp lỗi; chữ mỗi phút', () => {
    const s = summarizeErrors([
      { kind: 'dong-am', t: '在', got: '再' },
      { kind: 'dong-am', t: '在', got: '再' },
      { kind: 'sai-am', t: '知', got: '子', key: 'zh/z' },
      { kind: 'thieu', t: '在' },
      { kind: 'thua', got: '了' },
    ]);
    expect(s.swaps).toEqual([{ t: '在', got: '再', n: 2 }]);
    expect(s.sounds).toEqual([{ key: 'zh/z', n: 1 }]);
    expect(s.chars[0]).toEqual({ t: '在', n: 3 });
    expect(perMinute(30, 60_000)).toBe(30);
    expect(perMinute(10, 0)).toBe(0);
  });
});

describe('gõ chữ: chấm dấu câu (，、。…)', () => {
  // 我喜欢苹果、香蕉和西瓜。
  const tk: [string, string?, string?][] = [
    ['我', 'wǒ', '我_wo3'],
    ['喜欢', 'xǐhuan', '喜欢_xi3huan5'],
    ['苹果', 'píngguǒ', '苹果_ping2guo3'],
    ['、'],
    ['香蕉', 'xiāngjiāo', '香蕉_xiang1jiao1'],
    ['和', 'hé', '和_he2'],
    ['西瓜', 'xīguā', '西瓜_xi1gua1'],
    ['。'],
  ];
  const P = targetChars(tk as never, { punct: true });
  const typed = (s: string) => [...s].map((c) => ({ c }));
  const on = { punct: true };

  it('chữ đích có cả dấu câu khi chấm dấu câu (âm tiết trống); mặc định bỏ dấu câu', () => {
    expect(P.map((t) => t.c).join('')).toBe('我喜欢苹果、香蕉和西瓜。');
    expect(P[5]).toEqual({ c: '、', syl: '' });
    expect(targetChars(tk as never)).toHaveLength(10);
  });

  it('liệt kê dùng ， thay cho 、 là sai dấu câu; thiếu dấu hết câu; tắt chấm dấu câu thì bỏ qua', () => {
    const r = checkTyped(P, typed('我喜欢苹果，香蕉和西瓜。'), undefined, on);
    expect(r.ok).toBe(false);
    expect(r.cells.filter((c) => c.kind !== 'ok')).toEqual([{ kind: 'dau-cau', t: '、', got: '，' }]);
    expect(r).toMatchObject({ right: 11, total: 12 });
    expect([...marksOf(r.cells, typed('我喜欢苹果，香蕉和西瓜。'), on).bad]).toEqual([5]);
    const noEnd = checkTyped(P, typed('我喜欢苹果、香蕉和西瓜'), undefined, on);
    expect(noEnd.cells.at(-1)).toEqual({ kind: 'thieu', t: '。', syl: '' });
    expect([...marksOf(noEnd.cells, typed('我喜欢苹果、香蕉和西瓜'), on).gaps.entries()]).toEqual([[11, 1]]);
    const noList = checkTyped(P, typed('我喜欢苹果香蕉和西瓜。'), undefined, on);
    expect(noList.cells.map((c) => c.kind)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'thieu', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(checkTyped(P, typed('我喜欢苹果，香蕉和西瓜'))).toMatchObject({ ok: true, total: 10 });
  });

  it('chữ Hán gõ vào chỗ của dấu câu (hay ngược lại) là thiếu một, thừa một, không phải sai dấu', () => {
    const r = checkTyped(P, typed('我喜欢苹果的香蕉和西瓜。'), undefined, on);
    expect(r.cells.filter((c) => c.kind !== 'ok')).toEqual([
      { kind: 'thua', got: '的' },
      { kind: 'thieu', t: '、', syl: '' },
    ]);
  });

  it('gõ dở (gõ theo đoạn văn): dấu câu là chữ cần gõ tiếp; gõ đủ cả dấu mới xong', () => {
    expect(checkPrefix(P, typed('我喜欢苹果'), undefined, on)).toMatchObject({ next: 5, ok: false });
    expect(checkPrefix(P, typed('我喜欢苹果、香蕉和西瓜'), undefined, on)).toMatchObject({ next: 11, ok: false });
    expect(checkPrefix(P, typed('我喜欢苹果、香蕉和西瓜。'), undefined, on)).toMatchObject({ next: 12, ok: true });
    expect(checkPrefix(P, typed('我喜欢苹果、香蕉和西瓜'))).toMatchObject({ ok: true });
  });

  it('tổng hợp lỗi dấu câu (sai dấu, thiếu dấu, thừa dấu); chữ hay sai chỉ tính chữ Hán', () => {
    const s = summarizeErrors([
      { kind: 'dau-cau', t: '、', got: '，' },
      { kind: 'dau-cau', t: '、', got: '，' },
      { kind: 'thieu', t: '。' },
      { kind: 'thua', got: '，' },
      { kind: 'thieu', t: '在' },
    ]);
    expect(s.puncts).toEqual([
      { t: '、', got: '，', n: 2 },
      { t: '。', got: '', n: 1 },
      { t: '', got: '，', n: 1 },
    ]);
    expect(s.chars).toEqual([{ t: '在', n: 1 }]);
    expect(s.swaps).toEqual([]);
  });

  it('lời giải thích lỗi dấu câu', () => {
    expect(punctTip('、', '，')).toContain('dấu ngắt liệt kê 、 (phím \\)');
    expect(punctTip('，', '、')).toContain('Chỗ này cần dấu phẩy ， (phím ,)');
    expect(punctTip('。', undefined)).toBe('Thiếu dấu chấm tròn 。 (phím .).');
    expect(punctTip('、', undefined)).toContain('Khi liệt kê, giữa các món là dấu ngắt liệt kê.');
    expect(punctTip('…', undefined)).toBe('Thiếu dấu chấm lửng …… (phím ^).');
    expect(punctTip('（', undefined)).toBe('Thiếu mở ngoặc đơn （ (phím Shift + 9).');
    expect(punctTip(undefined, '，')).toBe('Chỗ này không có dấu ，, xoá đi.');
    expect(punctTip('。', '，')).toBe('Bạn gõ ， nhưng câu này kết thúc bằng dấu chấm tròn 。 (phím .).');
    expect(punctTip('？', '。')).toBe('Bạn gõ 。 nhưng chỗ này cần dấu hỏi ？ (phím ?).');
  });

  it('phím ghi trong bảng dấu khớp với bộ gõ của app (" và \' lần lượt ra ngoặc mở, ngoặc đóng)', () => {
    for (const m of ZH_PUNCT) {
      const k = PUNCT_INFO[m]?.key;
      expect(k, m).toBeTruthy();
      if (k !== '"' && k !== "'") expect(PUNCT[k]?.startsWith(m), `${k} → ${m}`).toBe(true);
    }
  });
});

describe('gõ chữ: bẫy dấu câu chỉ lấy chỗ trống không lưỡng lự giữa 、 và ，', () => {
  // từ viết cách nhau bằng dấu cách; @tên là tên riêng; từ loại theo bảng nhỏ (từ không có trong bảng: không rõ)
  const POS: Record<string, string[]> = {
    我: ['代'], 我们: ['代'], 有: ['动'], 一: ['数'], 两: ['数'], 个: ['量'], 哥哥: ['名'], 姐姐: ['名'], 今天: ['名'], 天气: ['名'],
    很: ['副'], 好: ['形'], 去: ['动'], 公园: ['名'], 吧: ['助'], 早上: ['名'], 中午: ['名'], 晚上: ['名'], 上班: ['动'], 的: ['助'],
    时候: ['名'], 都: ['副'], 看: ['动'], 喜欢: ['动'], 苹果: ['名'], 香蕉: ['名'], 和: ['介', '连'], 西瓜: ['名'], 那: ['代'], 来: ['动'],
    洗: ['动'], 米: ['名'], 做: ['动'], 米饭: ['名'], 他: ['代'], 会: ['动'], 打: ['动'], 篮球: ['名'], 踢: ['动'], 足球: ['名'], 也: ['副'],
    游泳: ['动'], 五: ['数'], 块: ['量'], 八: ['数'],
  };
  const tk = (s: string) =>
    s.split(' ').map((w) => (/^[，、。！？：]$/.test(w) ? [w] : w.startsWith('@') ? [w.slice(1), 'x'] : [w, 'x', `${w}_x`])) as never[];
  const posOf = (id: string) => POS[id.slice(0, id.indexOf('_'))] ?? [];
  const ok = (s: string) => {
    const t = tk(s);
    return t.flatMap((x: string[], i) => (x.length === 1 && (x[0] === '、' || x[0] === '，') ? [blankOk(t, i, posOf)] : []));
  };

  it('， ngắt vế câu, sau lời gọi: dùng được; 、 giữa các danh từ khi liệt kê: dùng được', () => {
    expect(ok('今天 天气 很 好 ， 我们 去 公园 吧 。')).toEqual([true]);
    expect(ok('@陈安 ， 你好 ！')).toEqual([true]);
    expect(ok('我 喜欢 苹果 、 香蕉 和 西瓜 。')).toEqual([true]);
  });

  it('， giữa hai cụm danh từ trơn (trông như liệt kê), ， nối tiếp chuỗi 、: bỏ', () => {
    expect(ok('我 有 一 个 哥哥 ， 两 个 姐姐 。')).toEqual([false]);
    expect(ok('一 个 五 块 ， 两 个 八 块 。')).toEqual([false]);
    expect(ok('早上 、 中午 、 晚上 ， 上班 的 时候 ， 我 都 看 ！')).toEqual([true, true, false, true]);
  });

  it('、 giữa hai cụm động từ: bỏ, trừ khi phía sau có 都, 也, 的 (rõ là liệt kê)', () => {
    expect(ok('那 我 来 洗 米 、 做 米饭 。')).toEqual([false]);
    expect(ok('他 会 打 篮球 、 踢 足球 ， 也 会 游泳 。')).toEqual([true, true]);
    // không phải dấu ở vị trí đó
    expect(blankOk(tk('我 喜欢 苹果 。'), 1, posOf)).toBe(false);
  });
});

