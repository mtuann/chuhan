import { describe, expect, it } from 'vitest';
import {
  alignMarked,
  parseNumbered,
  splitMarked,
  syllableToMarks,
  sylsToDisplay,
  sylsToKey,
  toneless,
} from '../../src/lib/pinyin';

const bt = (s: { base: string; tone: number }[] | null) => s?.map((y) => y.base + y.tone).join(' ') ?? null;

describe('splitMarked: tách pinyin dạng dấu', () => {
  it('tách từ viết liền theo số chữ', () => {
    expect(bt(splitMarked('àihào', 2))).toBe('ai4 hao4');
    expect(bt(splitMarked('Zhōngguó', 2))).toBe('zhong1 guo2');
    expect(bt(splitMarked('xiànshàng', 2))).toBe('xian4 shang4');
    expect(bt(splitMarked('dōngxi', 2))).toBe('dong1 xi5');
  });
  it('tôn trọng dấu nháy, dấu cách, gạch nối', () => {
    expect(bt(splitMarked('nǚ’ér', 2))).toBe('nv3 er2');
    expect(bt(splitMarked("fāng'àn", 2))).toBe('fang1 an4');
    expect(bt(splitMarked('bú kèqi', 3))).toBe('bu2 ke4 qi5');
    expect(bt(splitMarked('yìsī-bùgǒu', 4))).toBe('yi4 si1 bu4 gou3');
  });
  it('儿 hoá thành âm r', () => {
    expect(bt(splitMarked('yìdiǎnr', 3))).toBe('yi4 dian3 r5');
    expect(bt(splitMarked('nǎr', 2))).toBe('na3 r5');
  });
  it('âm không nguyên âm', () => {
    expect(bt(splitMarked('ǹg', 1))).toBe('ng4');
  });
  it('âm tiết a/o/e không đứng giữa chunk, trừ khi nới lỏng', () => {
    expect(splitMarked('téngài', 2)).toBeNull();
    expect(bt(splitMarked('téngài', 2, { lenient: true }))).toBe('teng2 ai4');
  });
  it('giữ nguyên chữ hoa trong text', () => {
    expect(splitMarked('Hànyǔ', 2)?.map((y) => y.text)).toEqual(['Hàn', 'yǔ']);
  });
});

describe('alignMarked: cắt theo cách tách của từ điển', () => {
  it('sửa trường hợp nguồn quên dấu nháy', () => {
    expect(bt(alignMarked('gǎnēn', ['gan', 'en']))).toBe('gan3 en1');
    expect(bt(alignMarked('téngài', ['teng', 'ai']))).toBe('teng2 ai4');
  });
  it('trả null khi chữ cái không khớp', () => {
    expect(alignMarked('xiàshàng', ['xian', 'shang'])).toBeNull();
  });
});

describe('dạng số', () => {
  it('parseNumbered đọc nhiều kiểu viết', () => {
    expect(bt(parseNumbered('ai4 hao4'))).toBe('ai4 hao4');
    expect(bt(parseNumbered('ai4hao4'))).toBe('ai4 hao4');
    expect(bt(parseNumbered("nv3'er2"))).toBe('nv3 er2');
    expect(bt(parseNumbered('nu:3'))).toBe('nv3');
    expect(bt(parseNumbered('lü3 you2'))).toBe('lv3 you2');
    expect(bt(parseNumbered('Zhong1 guo2'))).toBe('zhong1 guo2');
    expect(parseNumbered('A cai4')).toBeNull();
  });
  it('sylsToKey và sylsToDisplay', () => {
    const syls = parseNumbered('nv3 er2')!;
    expect(sylsToKey(syls)).toBe('nv3er2');
    expect(sylsToDisplay(syls)).toBe('nǚ’ér');
    expect(sylsToDisplay(parseNumbered('yi1 dian3 r5')!)).toBe('yīdiǎnr');
  });
  it('đặt dấu cho âm không nguyên âm', () => {
    expect(syllableToMarks('ng2')).toBe('ńg');
    expect(syllableToMarks('m2')).toBe('ḿ');
  });
  it('toneless', () => {
    expect(toneless('Nǚ’ér')).toBe('nver');
    expect(toneless('ai4 hao4')).toBe('aihao');
    expect(toneless('lu:4')).toBe('lv');
  });
});
