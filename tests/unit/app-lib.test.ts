/**
 * Tiện ích của bước 3: chữ tiếng Việt, nhãn cấp, cấu tạo chữ, chọn giọng đọc, chấm bài viết, tô màu pinyin.
 */
import { describe, expect, it } from 'vitest';
import { isMandarinCN, pickVoice, rankVoice, wordVoiceOrder, type VoiceLike } from '../../src/lib/audio';
import { gradeWriting } from '../../src/lib/grade';
import { foldVi, foldWords, fmtInt, idsComponents, isHan, levelLabel, packKey, posLabel, viCanon } from '../../src/lib/text';
import { studyDayKey } from '../../src/lib/db';
import { colorizePinyin } from '../../src/app/ui';

describe('chữ tiếng Việt', () => {
  it('foldVi: bỏ dấu, đ → d, chữ thường, gộp khoảng trắng', () => {
    expect(foldVi('Đại  Học ')).toBe('dai hoc');
    expect(foldVi('Nguyễn Văn Ước')).toBe('nguyen van uoc');
    expect(foldVi('ho\u0301a')).toBe('hoa');
  });
  it('viCanon: giữ dấu mũ/móc, thanh thành số, không phụ thuộc kiểu bỏ dấu', () => {
    expect(viCanon('hoá học')).toBe('hoa1 hoc5');
    expect(viCanon('hóa học')).toBe('hoa1 hoc5');
    expect(viCanon('Thuỷ')).toBe(viCanon('thủy'));
    expect(viCanon('cảm ơn')).not.toBe(viCanon('cấm ơn'));
    expect(viCanon('Hướng dẫn; (cũ)')).toBe('hương1 dân4 cu4');
  });
  it('foldWords: dấu câu thành khoảng trắng', () => {
    expect(foldWords('(bày tỏ) cảm ơn; lòng biết ơn')).toBe('bay to cam on long biet on');
  });
  it('isHan', () => {
    expect(isHan('好')).toBe(true);
    expect(isHan('a')).toBe(false);
    expect(isHan('〇')).toBe(true);
  });
});

describe('nhãn', () => {
  it('cấp HSK 2025', () => {
    expect(levelLabel(1)).toBe('HSK 1');
    expect(levelLabel(7)).toBe('Cấp 7–9');
    expect(levelLabel(0)).toBe('Ngoài HSK 2025');
    expect(levelLabel(undefined)).toBe('Ngoài HSK 2025');
  });
  it('khoá gói dữ liệu', () => {
    expect(packKey(3)).toBe('3');
    expect(packKey(0)).toBe('x');
    expect(packKey(undefined)).toBe('x');
  });
  it('từ loại', () => {
    expect(posLabel('名')).toBe('danh từ');
    expect(posLabel('量')).toBe('lượng từ');
    expect(posLabel('??')).toBe('??');
  });
  it('số kiểu Việt', () => {
    expect(fmtInt(12370)).toBe('12.370');
  });
});

describe('idsComponents', () => {
  it('bỏ ký hiệu bố cục và dấu ？, giữ thứ tự, không lặp', () => {
    expect(idsComponents('⿰女子')).toEqual(['女', '子']);
    expect(idsComponents('⿱⿰木木木')).toEqual(['木']);
    expect(idsComponents('⿰？子')).toEqual(['子']);
    expect(idsComponents(undefined)).toEqual([]);
    // chữ ngoài BMP (2 đơn vị UTF-16) giữ nguyên
    expect(idsComponents('⿰𠂉子')).toEqual(['𠂉', '子']);
  });
});

describe('giọng đọc', () => {
  const v = (name: string, lang: string, localService = true): VoiceLike => ({ name, lang, localService, voiceURI: `uri:${name}` });
  // Giống danh sách giọng tiếng Trung của Chrome trên macOS.
  const MAC: VoiceLike[] = [
    v('Eddy (Chinese (China mainland))', 'zh-CN'),
    v('Flo (Chinese (China mainland))', 'zh-CN'),
    v('Grandma (Chinese (China mainland))', 'zh-CN'),
    v('Grandpa (Chinese (China mainland))', 'zh-CN'),
    v('Meijia', 'zh-TW'),
    v('Reed (Chinese (China mainland))', 'zh-CN'),
    v('Rocko (Chinese (China mainland))', 'zh-CN'),
    v('Sandy (Chinese (China mainland))', 'zh-CN'),
    v('Shelley (Chinese (China mainland))', 'zh-CN'),
    v('Sinji', 'zh-HK'),
    v('Tingting', 'zh-CN'),
    v('Google 普通话（中国大陆）', 'zh-CN', false),
    v('Google 國語（臺灣）', 'zh-TW', false),
  ];

  it('chỉ nhận giọng Phổ thông đại lục', () => {
    for (const l of ['zh-CN', 'zh_CN', 'zh-cn', 'cmn-Hans-CN', 'zh-Hans-CN']) expect(isMandarinCN(l), l).toBe(true);
    for (const l of ['zh-TW', 'zh-HK', 'yue-HK', 'en-US', 'zh']) expect(isMandarinCN(l), l).toBe(false);
  });
  it('xếp hạng: giọng tốt đã biết > giọng mạng của Google > bộ giọng "cho vui"', () => {
    expect(rankVoice(MAC[10])).toBeGreaterThan(rankVoice(MAC[11]));
    expect(rankVoice(MAC[11])).toBeGreaterThan(rankVoice(MAC[0]));
    expect(rankVoice(MAC[4])).toBe(-1);
  });
  it('chọn Tingting trên macOS', () => {
    expect(pickVoice(MAC)?.name).toBe('Tingting');
  });
  it('giọng đã chọn trong Cài đặt được ưu tiên nếu còn; không còn thì chọn lại', () => {
    expect(pickVoice(MAC, 'uri:Flo (Chinese (China mainland))')?.name).toBe('Flo (Chinese (China mainland))');
    expect(pickVoice(MAC, 'uri:khong-con')?.name).toBe('Tingting');
  });
  it('giọng cho từ (thẻ, trang từ): giọng đã chọn đứng đầu, rồi giọng tốt nhất; không trùng; tối đa 2', () => {
    const auto = wordVoiceOrder(MAC).map((x) => x.name);
    expect(auto[0]).toBe('Tingting');
    expect(auto).toHaveLength(2);
    const chosen = wordVoiceOrder(MAC, 'uri:Flo (Chinese (China mainland))').map((x) => x.name);
    expect(chosen).toEqual(['Flo (Chinese (China mainland))', 'Tingting']);
    expect(wordVoiceOrder(MAC, 'uri:Tingting').map((x) => x.name)[0]).toBe('Tingting');
    expect(new Set(wordVoiceOrder(MAC, 'uri:Tingting').map((x) => x.name)).size).toBe(2);
    expect(wordVoiceOrder(MAC, 'uri:khong-con').map((x) => x.name)).toEqual(auto);
  });
  it('không có giọng zh-CN → undefined', () => {
    expect(pickVoice([v('Samantha', 'en-US'), v('Meijia', 'zh-TW')])).toBeUndefined();
    expect(pickVoice([])).toBeUndefined();
  });
  it('Android/Windows: giọng mạng tự nhiên vẫn được chọn khi không có giọng tốt cài sẵn', () => {
    expect(pickVoice([v('Chinese China', 'zh-CN'), v('Microsoft Xiaoxiao Online (Natural)', 'zh-CN', false)])?.name).toBe(
      'Microsoft Xiaoxiao Online (Natural)',
    );
  });
});

describe('chấm bài viết (spec F5)', () => {
  it('0 lỗi → Nhớ; ít lỗi → Khó; nhiều lỗi hoặc đã xem gợi ý → Quên', () => {
    expect(gradeWriting(0, 6, false)).toBe('good');
    expect(gradeWriting(2, 6, false)).toBe('hard');
    expect(gradeWriting(3, 6, false)).toBe('again');
    // chữ nhiều nét được phép nhiều lỗi hơn: ⌊0,2 × 15⌋ = 3
    expect(gradeWriting(3, 15, false)).toBe('hard');
    expect(gradeWriting(4, 15, false)).toBe('again');
    expect(gradeWriting(0, 6, true)).toBe('again');
  });
});

describe('ngày học bắt đầu lúc 4 giờ sáng', () => {
  it('trước 4 giờ vẫn tính là ngày hôm trước', () => {
    expect(studyDayKey(new Date(2026, 9, 6, 3, 59).getTime())).toBe('2026-10-05');
    expect(studyDayKey(new Date(2026, 9, 6, 4, 0).getTime())).toBe('2026-10-06');
  });
});

describe('colorizePinyin', () => {
  it('tách âm tiết theo thanh, giữ dấu cách và dấu nháy', () => {
    expect(colorizePinyin('nǐ hǎo')).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: ' ' },
      { text: 'hǎo', tone: 3 },
    ]);
    expect(colorizePinyin('nǚ’ér')).toEqual([{ text: 'nǚ', tone: 3 }, { text: '’' }, { text: 'ér', tone: 2 }]);
    expect(colorizePinyin('xièxie')).toEqual([
      { text: 'xiè', tone: 4 },
      { text: 'xie', tone: 5 },
    ]);
  });
  it('一, 不 tô theo thanh đã biến điệu như trên trang', () => {
    expect(colorizePinyin('yíxià').map((x) => x.tone)).toEqual([2, 4]);
  });
  it('chuỗi không đọc được thì giữ nguyên, không tô', () => {
    expect(colorizePinyin('ABC!')).toEqual([{ text: 'ABC!' }]);
  });
});
