import { describe, expect, it } from 'vitest';
import { hanCount, passageId, splitUnits, tidyPassage } from '../../src/lib/passage';
import { buildHsk, segment, type SearchRowLike } from '../../src/lib/reader';

const row = (id: string, lv: number, p: string): SearchRowLike => [id, lv, p, '', '', ''];
const hsk = buildHsk([
  row('我_wo3', 1, 'wǒ'),
  row('在_zai4', 1, 'zài'),
  row('学校_xue2xiao4', 1, 'xuéxiào'),
  row('学习_xue2xi2', 1, 'xuéxí'),
  row('汉语_han4yu3', 1, 'Hànyǔ'),
  row('今天_jin1tian1', 1, 'jīntiān'),
  row('天气_tian1qi4', 1, 'tiānqì'),
  row('很_hen3', 1, 'hěn'),
  row('好_hao3', 1, 'hǎo'),
  row('他_ta1', 1, 'tā'),
  row('说_shuo1', 1, 'shuō'),
  row('一点儿_yi1dian3r5', 1, 'yìdiǎnr'),
]);
const read = (s: string) => segment(s, { hsk, dict: new Map() });
/** số chữ Hán cần gõ của một câu (không tính dấu câu) */
const han = (u: { target: { c: string }[] }) => u.target.filter((t) => /\p{Script=Han}/u.test(t.c)).length;

describe('gõ theo đoạn văn: chia câu', () => {
  it('hết câu ở 。！？, dấu đóng ngoặc kép thuộc câu trước, xuống dòng là đoạn mới', () => {
    const u = splitUnits(read('我在学校学习汉语。今天天气很好！\n他说：“很好。”'));
    expect(u.map((x) => x.text)).toEqual(['我在学校学习汉语。', '今天天气很好！', '他说：“很好。”']);
    expect(u.map((x) => x.para)).toEqual([true, false, true]);
    // chữ đích: chữ Hán kèm âm tiết, dấu câu tiếng Trung (âm tiết trống, chỉ chấm khi bật chấm dấu câu)
    expect(u[0].target.map((c) => c.syl)).toEqual(['wo', 'zai', 'xue', 'xiao', 'xue', 'xi', 'han', 'yu', '']);
    expect(u[0].target[8].c).toBe('。');
    // vị trí từng chữ đích trong token của câu
    expect(u[0].at.slice(0, 4)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(u[0].at[8]).toEqual([5, 0]);
    expect(u[2].target.map((c) => c.c).join('')).toBe('他说：“很好。”');
  });

  it('câu dài cắt ở dấu phẩy, quá dài mà không có dấu phẩy thì cắt ở ranh giới từ; bỏ câu không có chữ Hán', () => {
    const long = '我在学校学习汉语，我在学校学习汉语，我在学校学习汉语。';
    expect(splitUnits(read(long), 8, 30).map(han)).toEqual([8, 8, 8]);
    expect(splitUnits(read(long), 16, 30).map(han)).toEqual([16, 8]);
    expect(splitUnits(read(long), 16, 30).map((x) => x.target.length)).toEqual([18, 9]);
    const noComma = '我在学校学习汉语我在学校学习汉语我在学校';
    expect(splitUnits(read(noComma), 16, 10).every((x) => han(x) <= 11)).toBe(true);
    expect(splitUnits(read('OK! 123.\n我很好。'))).toHaveLength(1);
  });

  it('dấu câu thừa sau dấu hết câu (？！, ……) không mất; dấu câu đứng đầu đoạn đi với câu sau, giữ đoạn mới', () => {
    const u = splitUnits(read('我很好……他很好吗？！\n！我很好。'));
    expect(u.map((x) => x.text)).toEqual(['我很好……', '他很好吗？！', '！我很好。']);
    expect(u.map((x) => x.para)).toEqual([true, false, true]);
    expect(u[2].at.slice(0, 2)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(u[0].target.map((c) => c.c).join('')).toBe('我很好……');
  });

  it('儿 hoá và chữ ngoài từ điển: âm tiết để trống khi không tách được', () => {
    const u = splitUnits(read('一点儿龘。'));
    expect(u[0].target.map((c) => c.c)).toEqual(['一', '点', '儿', '龘', '。']);
    expect(u[0].target[3].syl).toBe('');
  });
});

describe('gõ theo đoạn văn: văn bản dán vào', () => {
  it('bỏ khoảng trắng đầu cuối dòng, gộp dòng trống, cắt độ dài', () => {
    expect(tidyPassage('  我很好。 \r\n\n\n  他很好。\n\n')).toBe('我很好。\n\n他很好。');
    expect(tidyPassage('我很好。', 2)).toBe('我很');
    expect(hanCount('我很好。OK')).toBe(3);
  });

  it('mã đoạn văn: cùng văn bản cùng mã, khác văn bản khác mã', () => {
    expect(passageId('我很好。')).toBe(passageId('我很好。'));
    expect(passageId('我很好。')).not.toBe(passageId('他很好。'));
  });
});
