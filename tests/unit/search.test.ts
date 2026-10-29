/**
 * Tra từ: đọc truy vấn pinyin, chấm điểm Hán Việt, xếp hạng (bộ dữ liệu nhỏ viết tay)
 * và các ví dụ trong spec F4 trên dữ liệu thật (bỏ qua nếu chưa chạy `npm run data`).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SearchIndex, entryFromRow, hanvietScore, parsePinyinQuery, pinyinScore, prepareHv } from '../../src/lib/search-core';
import type { SearchRow } from '../../src/schema/data';

const ROWS: SearchRow[] = [
  ['你好_ni3hao3', 1, 'nǐ hǎo', 'nễ hảo', 'xin chào; chào', 'hello; hi'],
  ['学_xue2', 1, 'xué', 'học', 'học; học tập; bắt chước', 'to learn; to study'],
  ['学习_xue2xi2', 1, 'xuéxí', 'học tập', 'học; tìm hiểu', 'to learn; to study'],
  ['大学_da4xue2', 1, 'dàxué', 'đại học', 'trường đại học', 'university; college'],
  ['大学生_da4xue2sheng1', 1, 'dàxuéshēng', 'đại học sinh', 'sinh viên đại học', 'university student'],
  ['化学_hua4xue2', 5, 'huàxué', 'hoá học', 'hóa học; chất hóa học', 'chemistry; chemical'],
  ['雪_xue3', 1, 'xuě', 'tuyết', 'tuyết', 'snow'],
  ['女儿_nv3er2', 1, 'nǚ’ér', 'nữ nhi', 'con gái', 'daughter'],
  ['路_lu4', 2, 'lù', 'lộ', 'đường; tuyến', 'road; route'],
  ['绿_lv4', 0, 'lǜ', 'lục', 'màu xanh lá', 'green'],
  ['一下_yi1xia4', 1, 'yíxià', 'nhất hạ', 'thử xem; một lần', 'a little bit; once'],
  ['一向_yi1xiang4', 6, 'yíxiàng', 'nhất hướng', 'luôn luôn', 'always'],
  ['不客气_bu4ke4qi5', 1, 'bú kèqi', 'bất khách khí', 'không có chi', "you're welcome"],
  ['谢谢_xie4xie5', 1, 'xièxie', 'tạ tạ', 'cảm ơn; cảm ơn bạn', 'to thank; thanks'],
  ['感谢_gan3xie4', 4, 'gǎnxiè', 'cảm tạ', '(bày tỏ) cảm ơn; lòng biết ơn', '(express) thanks; gratitude'],
  ['取缔_qu3di4', 7, 'qǔdì', 'thủ đế', 'trấn áp; cấm', 'to suppress; to ban'],
  ['先_xian1', 3, 'xiān', 'tiên', 'trước; đầu tiên', 'early; prior'],
  ['老师_lao3shi1', 1, 'lǎoshī', 'lão sư', 'giáo viên', 'teacher'],
  ['师生_shi1sheng1', 4, 'shīshēng', 'sư sinh', 'giáo viên và học sinh', 'teachers and students'],
  ['吗_ma5', 1, 'ma', 'ma', 'trợ từ nghi vấn', 'question particle'],
  ['马_ma3', 3, 'mǎ', 'mã', 'ngựa', 'horse'],
  ['磨_mo2', 7, 'mó', 'ma', 'cọ; xay', 'to rub; to grind'],
  ['爱_ai4', 1, 'ài', 'ái', 'yêu; thích', 'to love'],
  ['爱好_ai4hao4', 2, 'àihào', 'ái hiếu', 'sở thích', 'hobby'],
  ['好_hao3', 1, 'hǎo', 'hảo', 'tốt; hay', 'good; well'],
  ['好_hao4', 2, 'hào', 'hiếu', 'thích', 'to be fond of'],
];

function index(rows: readonly SearchRow[] = ROWS) {
  const idx = new SearchIndex();
  idx.add(rows);
  return idx;
}
const entry = (id: string) => entryFromRow(ROWS.find((r) => r[0] === id)!);
const firstId = (idx: SearchIndex, q: string) => idx.search(q, 5)[0]?.id;
const ids = (idx: SearchIndex, q: string, n = 10) => idx.search(q, n).map((h) => h.id);

describe('parsePinyinQuery', () => {
  it('pinyin số: vị trí thanh ở chữ cái cuối âm tiết, có đánh dấu ranh giới', () => {
    expect(parsePinyinQuery('ni3hao3')).toEqual({
      joined: 'nihao',
      marks: [
        { at: 1, tone: 3, boundary: true },
        { at: 4, tone: 3, boundary: true },
      ],
      breaks: [],
      hasV: false,
    });
  });
  it('pinyin có dấu: thanh ở nguyên âm mang dấu, khoảng trắng là chỗ ngăn âm tiết', () => {
    expect(parsePinyinQuery('nǐ hǎo')).toEqual({
      joined: 'nihao',
      marks: [
        { at: 1, tone: 3, boundary: false },
        { at: 3, tone: 3, boundary: false },
      ],
      breaks: [2],
      hasV: false,
    });
    expect(parsePinyinQuery("xī'ān")?.breaks).toEqual([2]);
    expect(parsePinyinQuery('  zhong guo  ')?.breaks).toEqual([5]);
  });
  it('ü viết là ü, v hoặc u:', () => {
    for (const q of ['nǚ', 'nü3', 'nv3', 'nu:3', 'NǙ']) expect(parsePinyinQuery(q)).toMatchObject({ joined: 'nv', hasV: true });
    expect(parsePinyinQuery('nu3')).toMatchObject({ joined: 'nu', hasV: false });
  });
  it('dạng tổ hợp (NFD) đọc như dạng dựng sẵn', () => {
    expect(parsePinyinQuery('xue\u0301')).toEqual(parsePinyinQuery('xué'));
  });
  it('không phải pinyin: dấu riêng của tiếng Việt, đ, chữ Hán, chỉ có số', () => {
    for (const q of ['học', 'đại', 'cảm ơn', 'tiếng', '你好', '123', '3', '', '   ', 'a+b']) expect(parsePinyinQuery(q), q).toBeNull();
  });
});

describe('pinyinScore', () => {
  const score = (q: string, id: string) => pinyinScore(parsePinyinQuery(q)!, entry(id));
  it('đủ thanh 900, ghi một phần 820, không thanh 800, sai thanh 0', () => {
    expect(score('ni3hao3', '你好_ni3hao3')).toBe(900);
    expect(score('nǐ hǎo', '你好_ni3hao3')).toBe(900);
    expect(score('ni hǎo', '你好_ni3hao3')).toBe(820);
    expect(score('nihao', '你好_ni3hao3')).toBe(800);
    expect(score('ni3hao4', '你好_ni3hao3')).toBe(0);
  });
  it('khinh thanh không ghi dấu vẫn là đủ thanh', () => {
    expect(score('xièxie', '谢谢_xie4xie5')).toBe(900);
    expect(score('xie4xie', '谢谢_xie4xie5')).toBe(900);
    expect(score('xie4xie5', '谢谢_xie4xie5')).toBe(900);
  });
  it('一, 不: khớp cả thanh gốc lẫn thanh đã biến điệu như trên trang', () => {
    expect(entry('一下_yi1xia4').dtones).toEqual([2, 4]);
    expect(entry('你好_ni3hao3').dtones).toBeUndefined();
    for (const q of ['yíxià', 'yi2xia4', 'yi1xia4', 'yīxià', 'yixia']) expect(score(q, '一下_yi1xia4'), q).toBeGreaterThanOrEqual(800);
    expect(score('yi4xia4', '一下_yi1xia4')).toBe(0);
    expect(score('bú kèqi', '不客气_bu4ke4qi5')).toBe(900);
    expect(score('bu4ke4qi5', '不客气_bu4ke4qi5')).toBe(900);
  });
  it('gõ u thay ü: vẫn khớp nhưng thấp hơn', () => {
    expect(score('nǚ’ér', '女儿_nv3er2')).toBe(900);
    expect(score('nǚér', '女儿_nv3er2')).toBe(900);
    expect(score('nu3er2', '女儿_nv3er2')).toBe(870);
    expect(score('nuer', '女儿_nv3er2')).toBe(770);
    expect(score('lu', '路_lu4')).toBeGreaterThan(score('lu', '绿_lv4'));
    // đã gõ v thì không nới
    expect(score('lv', '路_lu4')).toBe(0);
  });
  it('ranh giới âm tiết phải khớp', () => {
    expect(score('xian', '先_xian1')).toBe(800);
    expect(score("xī'ān", '先_xian1')).toBe(0);
    expect(score('xi1an1', '先_xian1')).toBe(0);
    expect(score('x ue', '学_xue2')).toBe(0);
  });
  it('đang gõ dở: khớp phần đầu, điểm thấp hơn khớp trọn', () => {
    const part = score('xue', '学习_xue2xi2');
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(score('xue', '学_xue2'));
    expect(score('xué', '学习_xue2xi2')).toBeGreaterThan(0);
    expect(score('xuě', '学习_xue2xi2')).toBe(0);
    // một chữ cái chỉ khớp trọn
    expect(score('x', '学_xue2')).toBe(0);
  });
});

describe('hanvietScore', () => {
  const score = (q: string, id: string) => hanvietScore(prepareHv(q)!, entry(id));
  it('đúng dấu 880, không dấu 760, đ = d', () => {
    expect(score('học', '学_xue2')).toBe(880);
    expect(score('hoc', '学_xue2')).toBe(760);
    expect(score('HỌC', '学_xue2')).toBe(880);
    expect(score('đại học', '大学_da4xue2')).toBe(880);
    expect(score('dai hoc', '大学_da4xue2')).toBe(760);
  });
  it('không phụ thuộc kiểu bỏ dấu cũ/mới (hoá/hóa) và dạng tổ hợp', () => {
    expect(score('hoá học', '化学_hua4xue2')).toBe(880);
    expect(score('hóa học', '化学_hua4xue2')).toBe(880);
    expect(score('ho\u0301a ho\u0323c', '化学_hua4xue2')).toBe(880);
  });
  it('sai dấu vẫn khớp như không dấu', () => {
    expect(score('hóc', '学_xue2')).toBe(760);
  });
  it('khớp đầu từ, khớp một âm, đang gõ dở', () => {
    expect(score('đại học', '大学生_da4xue2sheng1')).toBe(370);
    expect(score('dai hoc', '大学生_da4xue2sheng1')).toBe(330);
    expect(score('hoc', '大学_da4xue2')).toBe(150);
    expect(score('dai ho', '大学_da4xue2')).toBeGreaterThan(0);
    expect(score('h', '大学_da4xue2')).toBe(0);
  });
});

describe('SearchIndex.search', () => {
  const idx = index();
  it('ví dụ trong spec: nihao, ni3hao3, nǐ hǎo đều ra 你好 đầu tiên', () => {
    for (const q of ['nihao', 'ni3hao3', 'nǐ hǎo', 'ni hao', 'NiHao', 'Nǐ Hǎo']) expect(firstId(idx, q), q).toBe('你好_ni3hao3');
  });
  it('Hán Việt không cần dấu: hoc → 学, học tập → 学习, dai hoc → 大学', () => {
    expect(firstId(idx, 'hoc')).toBe('学_xue2');
    expect(firstId(idx, 'học')).toBe('学_xue2');
    expect(firstId(idx, 'học tập')).toBe('学习_xue2xi2');
    expect(firstId(idx, 'hoc tap')).toBe('学习_xue2xi2');
    expect(firstId(idx, 'đại học')).toBe('大学_da4xue2');
    expect(firstId(idx, 'dai hoc')).toBe('大学_da4xue2');
    expect(firstId(idx, 'Đại Học')).toBe('大学_da4xue2');
    expect(firstId(idx, 'hóa học')).toBe('化学_hua4xue2');
  });
  it('nghĩa tiếng Việt và tiếng Anh', () => {
    expect(ids(idx, 'cảm ơn', 2)).toEqual(['谢谢_xie4xie5', '感谢_gan3xie4']);
    expect(ids(idx, 'cam on', 2)).toEqual(['谢谢_xie4xie5', '感谢_gan3xie4']);
    expect(firstId(idx, 'giáo viên')).toBe('老师_lao3shi1');
    expect(firstId(idx, 'teacher')).toBe('老师_lao3shi1');
    expect(firstId(idx, 'chemistry')).toBe('化学_hua4xue2');
    // gõ dở từ cuối
    expect(ids(idx, 'chemis')).toContain('化学_hua4xue2');
  });
  it('gõ không dấu "ma": khớp pinyin xếp trên khớp Hán Việt', () => {
    const r = ids(idx, 'ma');
    expect(r.slice(0, 2)).toEqual(['吗_ma5', '马_ma3']);
    expect(r.indexOf('磨_mo2')).toBeGreaterThan(1);
  });
  it('chữ Hán: khớp đúng → bắt đầu bằng → chứa; từ đồng tự đều hiện', () => {
    expect(ids(idx, '爱', 3)).toEqual(['爱_ai4', '爱好_ai4hao4']);
    // 好 đứng cuối trong 你好, 爱好: "chứa" xếp sau "khớp đúng", cấp thấp trước
    expect(ids(idx, '好', 4)).toEqual(['好_hao3', '好_hao4', '你好_ni3hao3', '爱好_ai4hao4']);
    expect(ids(idx, '学', 3)).toEqual(['学_xue2', '学习_xue2xi2', '大学_da4xue2']);
  });
  it('cùng điểm thì cấp thấp trước, ngoài HSK 2025 xếp cuối', () => {
    const r = idx.search('xue', 10);
    expect(r[0].id).toBe('学_xue2');
    expect(r.findIndex((h) => h.id === '雪_xue3')).toBe(1);
    const lu = ids(idx, 'lu');
    expect(lu.indexOf('路_lu4')).toBeLessThan(lu.indexOf('绿_lv4'));
  });
  it('truy vấn rỗng hoặc toàn khoảng trắng → không có kết quả; giới hạn số kết quả', () => {
    expect(idx.search('')).toEqual([]);
    expect(idx.search('   ')).toEqual([]);
    expect(idx.search('x', 50).length).toBeLessThanOrEqual(50);
    expect(idx.search('hoc', 2)).toHaveLength(2);
  });
  it('kết quả mang đủ trường để hiển thị và lý do khớp', () => {
    expect(idx.search('ni3hao3')[0]).toMatchObject({ s: '你好', lv: 1, p: 'nǐ hǎo', hv: 'nễ hảo', why: 'pinyin', score: 900 });
    expect(idx.search('học')[0].why).toBe('hanviet');
    expect(idx.search('teacher')[0].why).toBe('nghia');
    expect(idx.search('爱')[0].why).toBe('han');
  });
});

describe('SearchIndex: resolve, containing, add', () => {
  const idx = index();
  it('resolve trả mọi cách đọc của một chữ, cấp thấp trước', () => {
    expect(idx.resolve('好').map((e) => e.id)).toEqual(['好_hao3', '好_hao4']);
    expect(idx.resolve('没有')).toEqual([]);
  });
  it('containing: từ chứa chữ, không tính chính nó, cấp thấp và ngắn trước', () => {
    expect(idx.containing('学', 3).map((e) => e.id)).toEqual(['大学_da4xue2', '学习_xue2xi2', '大学生_da4xue2sheng1']);
    expect(idx.containing('好', 5).map((e) => e.id)).toEqual(['你好_ni3hao3', '爱好_ai4hao4']);
  });
  it('add bỏ qua mục trùng id', () => {
    const i2 = index();
    i2.add(ROWS.slice(0, 3));
    expect(i2.size).toBe(ROWS.length);
    expect(i2.search('nihao')).toHaveLength(1);
  });
});

/* ---------- dữ liệu thật ---------- */

const DIR = 'public/data';
const hasData = existsSync(path.join(DIR, 'manifest.json'));

describe.skipIf(!hasData)('Tra từ trên dữ liệu thật', () => {
  const real = new SearchIndex();
  if (hasData) {
    const m = JSON.parse(readFileSync(path.join(DIR, 'manifest.json'), 'utf8')) as { search: Record<string, { files: string[] }> };
    for (const k of Object.keys(m.search))
      for (const f of m.search[k].files) real.add((JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as { rows: SearchRow[] }).rows);
  }

  it('chỉ mục có toàn bộ từ', () => {
    expect(real.size).toBeGreaterThan(12000);
  });

  it.each([
    ['nihao', '你好_ni3hao3'],
    ['ni3hao3', '你好_ni3hao3'],
    ['nǐ hǎo', '你好_ni3hao3'],
    ['hoc', '学_xue2'],
    ['học tập', '学习_xue2xi2'],
    ['đại học', '大学_da4xue2'],
    ['dai hoc', '大学_da4xue2'],
    ['爱', '爱_ai4'],
    ['yíxià', '一下_yi1xia4'],
    ['nu3er2', '女儿_nv3er2'],
    ['xièxie', '谢谢_xie4xie5'],
    ['cảm ơn', '谢谢_xie4xie5'],
    ['teacher', '老师_lao3shi1'],
  ])('%s → %s đầu tiên', (q, id) => {
    expect(real.search(q, 5)[0]?.id).toBe(id);
  });

  it('đủ nhanh: mỗi truy vấn dưới 150 ms trên máy chạy test', () => {
    const qs = ['nihao', 'hoc', 'học', 'đại học', 'cảm ơn', 'teacher', 'xue', 'zhongguo', 'ma', 'hoc tap', '学', 'giáo viên', 'an', 'shi'];
    for (const q of qs) {
      const t = performance.now();
      real.search(q, 50);
      expect(performance.now() - t, q).toBeLessThan(150);
    }
  });
});
