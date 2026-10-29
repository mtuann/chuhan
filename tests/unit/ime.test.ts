import { describe, expect, it } from 'vitest';
import { addNames, buildImeLexicon, candidates, compose, hasVietnamese, rest, segment, shortMeaning, showInput } from '../../src/lib/ime';
import type { SearchRowLike } from '../../src/lib/reader';

const row = (id: string, lv: number, p: string, hv: string, vi: string, q?: number): SearchRowLike =>
  q ? [id, lv, p, hv, vi, '', q] : [id, lv, p, hv, vi, ''];
const ROWS: SearchRowLike[] = [
  row('在_zai4', 1, 'zài', 'tại', 'ở; tại', 5),
  row('再_zai4', 1, 'zài', 'tái', 'lại; nữa', 91),
  row('学习_xue2xi2', 1, 'xuéxí', 'học tập', 'học; học tập', 789),
  row('学校_xue2xiao4', 1, 'xuéxiào', 'học hiệu', 'trường học', 600),
  row('学生_xue2sheng5', 1, 'xuésheng', 'học sinh', 'học sinh', 651),
  row('学_xue2', 1, 'xué', 'học', 'học', 300),
  row('我_wo3', 1, 'wǒ', 'ngã', 'tôi', 3),
  row('我们_wo3men5', 1, 'wǒmen', 'ngã môn', 'chúng tôi', 20),
  row('爱_ai4', 1, 'ài', 'ái', 'yêu', 400),
  row('你_ni3', 1, 'nǐ', 'nễ', 'bạn', 10),
  row('你好_ni3hao3', 1, 'nǐ hǎo', 'nễ hảo', 'xin chào'),
  row('女_nv3', 1, 'nǚ', 'nữ', 'nữ', 700),
  row('一点儿_yi1dian3r5', 1, 'yìdiǎnr', 'nhất điểm', 'một chút', 900),
  row('西瓜_xi1gua1', 2, 'xīguā', 'tây qua', 'dưa hấu'),
  row('T恤_T xu4', 4, 'T xù', 'T tuất', 'áo phông'),
];
const lex = () => buildImeLexicon(ROWS);
const top = (input: string, n = 5) =>
  candidates(lex(), input)
    .slice(0, n)
    .map((c) => c.e.t);

describe('bộ gõ pinyin: tách chuỗi gõ', () => {
  it('âm tiết trọn trước, gõ dở ở cuối, gõ tắt; dấu nháy bắt buộc tách', () => {
    expect(segment('xian')[0].map((p) => p.s)).toEqual(['xian']);
    expect(segment('xian').map((s) => s.map((p) => p.s).join('|'))).toContain('xi|an');
    expect(segment("xi'an")[0].map((p) => p.s)).toEqual(['xi', 'an']);
    expect(segment('xuex')[0]).toMatchObject([{ s: 'xue', k: 'syl' }, { s: 'x', k: 'pre' }]);
    expect(segment('xs')[0]).toMatchObject([{ s: 'x', k: 'ini' }, { s: 's', k: 'pre' }]);
    expect(segment('yidianr')[0].map((p) => p.s)).toEqual(['yi', 'dian', 'r']);
    expect(showInput('xuexi')).toBe("xue'xi");
    expect(segment('i')).toEqual([]);
  });
});

describe('bộ gõ pinyin: gợi ý', () => {
  it('từ khớp trọn trước, rồi từ khớp phần đầu; xếp theo độ hay gặp', () => {
    expect(top('zai')).toEqual(['在', '再']);
    // âm cuối gõ trọn vẫn gợi ý từ dài hơn (đang gõ dở xiao) sau từ khớp đúng
    expect(top('xuexi', 3)).toEqual(['学习', '学校', '学']);
    const c = candidates(lex(), 'xuexi');
    expect(c[0]).toMatchObject({ full: true, used: 5 });
    expect(c.find((x) => x.e.t === '学')).toMatchObject({ full: false, used: 3 });
    expect(rest('xuexi', c.find((x) => x.e.t === '学')!)).toBe('xi');
    expect(rest("xue'xi", { used: 3 })).toBe('xi');
  });

  it('gõ dở, gõ tắt (s lấy cả sh), ü gõ v, 儿 hoá', () => {
    expect(top('xuex')).toEqual(['学校', '学习', '学']);
    expect(top('xs')).toContain('学生');
    expect(top('xx', 2)).toEqual(['学校', '学习']);
    expect(top('nv')).toEqual(['女']);
    expect(top('yidianr')[0]).toBe('一点儿');
  });

  it('chữ tách từ từ (习 trong 学习) có Hán Việt và pinyin của chữ; từ có chữ Latinh bị bỏ', () => {
    const xi = candidates(lex(), 'xi').find((c) => c.e.t === '习')!;
    expect(xi.e).toMatchObject({ hv: 'tập', p: 'xí', of: '学习', m: '' });
    expect(top('t')).not.toContain('T恤');
    expect(lex().charSyl.get('学')).toEqual(new Set(['xue']));
    expect(lex().charInfo.get('再')).toMatchObject({ hv: 'tái' });
  });

  it('gõ cả câu: ghép từ hay gặp nhất khi không có từ nào khớp trọn', () => {
    expect(top('woaini')[0]).toBe('我爱你');
    const segs = segment('woxuexi');
    const e = compose(lex(), segs[0])!;
    expect(e.t).toBe('我学习');
    expect(e.parts?.map((x) => x.t)).toEqual(['我', '学习']);
    expect(e.syl).toEqual(['wo', 'xue', 'xi']);
    // có từ khớp trọn thì không ghép
    expect(top('women')[0]).toBe('我们');
  });

  it('tên riêng của bài', () => {
    const l = lex();
    addNames(l, [['陈安', 'Chén Ān']]);
    expect(candidates(l, 'chenan')[0].e.t).toBe('陈安');
    expect(l.charSyl.get('陈')).toEqual(new Set(['chen']));
  });
});

describe('bộ gõ pinyin: tiện ích', () => {
  it('nghĩa ngắn; nhận ra bộ gõ tiếng Việt đang bật', () => {
    expect(shortMeaning('học; học tập; tìm hiểu')).toBe('học; học tập');
    expect(shortMeaning('một nghĩa rất rất dài dài dài dài dài dài dài')).toHaveLength(28);
    expect(hasVietnamese('xuẽi')).toBe(true);
    expect(hasVietnamese('đ')).toBe(true);
    expect(hasVietnamese("xue'xi")).toBe(false);
  });
});

describe('ô gõ: chọn lại chữ đã gõ', () => {
  it('nhóm chữ chọn cùng một lần; chữ không có nhóm là một mình', async () => {
    const { groupRange } = await import('../../src/app/typing/ImeBox');
    const v = [{ c: '我', g: 1 }, { c: '学', g: 2 }, { c: '校', g: 2 }, { c: '。' }];
    expect(groupRange(v, 0)).toEqual([0, 1]);
    expect(groupRange(v, 2)).toEqual([1, 3]);
    expect(groupRange(v, 3)).toEqual([3, 4]);
  });

  it('các chữ cùng cách gõ (theo âm đã gõ, hoặc mọi âm của chữ gõ bằng bộ gõ của máy), không gồm chính nó', async () => {
    const { alternatives } = await import('../../src/app/typing/ImeBox');
    const l = lex();
    const a = alternatives(l, [{ c: '再', syl: 'zai' }]);
    expect(a.cur?.e.t).toBe('再');
    expect(a.alts.map((c) => c.e.t)).toEqual(['在']);
    expect(alternatives(l, [{ c: '在' }]).alts.map((c) => c.e.t)).toEqual(['再']);
    // từ hai chữ: chỉ gợi ý từ hai chữ cùng cách gõ
    expect(alternatives(l, [{ c: '学', syl: 'xue' }, { c: '校', syl: 'xiao' }]).alts).toEqual([]);
    // chỉ đúng âm tiết đã gõ: 先 xian không gợi ý 想 xiang
    const l2 = buildImeLexicon([row('先_xian1', 1, 'xiān', 'tiên', 'trước', 300), row('想_xiang3', 1, 'xiǎng', 'tưởng', 'nghĩ', 100), row('现_xian4', 1, 'xiàn', 'hiện', 'bây giờ', 200)]);
    expect(alternatives(l2, [{ c: '先', syl: 'xian' }]).alts.map((c) => c.e.t)).toEqual(['现']);
  });
});
