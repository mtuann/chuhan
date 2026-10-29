import { describe, expect, it } from 'vitest';
import { joinBase } from '../../src/lib/url';
import { numberedToMarks, syllableToMarks, tonesOf } from '../../src/lib/pinyin';

describe('joinBase', () => {
  it('ghép base có và không có dấu /', () => {
    expect(joinBase('/chuhan/', 'tu/')).toBe('/chuhan/tu/');
    expect(joinBase('/chuhan', '/tu/')).toBe('/chuhan/tu/');
    expect(joinBase('/chuhan/')).toBe('/chuhan/');
    expect(joinBase('/', 'tu/')).toBe('/tu/');
    expect(joinBase('/chuhan/pr-preview/pr-3/', 'kiem-tra/')).toBe('/chuhan/pr-preview/pr-3/kiem-tra/');
  });
});

describe('pinyin', () => {
  it('đặt dấu đúng quy tắc', () => {
    expect(syllableToMarks('hao3')).toBe('hǎo');
    expect(syllableToMarks('xue2')).toBe('xué');
    expect(syllableToMarks('gou3')).toBe('gǒu');
    expect(syllableToMarks('gui4')).toBe('guì');
    expect(syllableToMarks('liu2')).toBe('liú');
    expect(syllableToMarks('lv4')).toBe('lǜ');
    expect(syllableToMarks('nu:3')).toBe('nǚ');
    expect(syllableToMarks('de5')).toBe('de');
    expect(syllableToMarks('Bei3')).toBe('Běi');
  });
  it('chuyển cả chuỗi và lấy thanh', () => {
    expect(numberedToMarks('ai4hao4')).toBe('àihào');
    expect(numberedToMarks('ni3 hao3')).toBe('nǐ hǎo');
    expect(numberedToMarks('dong1xi5')).toBe('dōngxi');
    expect(tonesOf('dong1xi5')).toEqual([1, 5]);
  });
});
