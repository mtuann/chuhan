import { describe, expect, it } from 'vitest';
import {
  addDict,
  buildHsk,
  coverage,
  dictNeeds,
  dictPinyin,
  fromTokens,
  nameHanviet,
  segment,
  sentences,
  type DictWord,
  type ReadTok,
  type SearchRowLike,
} from '../../src/lib/reader';

const row = (id: string, lv: number, p: string, hv = '', m = ''): SearchRowLike => [id, lv, p, hv, m, ''];
const ROWS: SearchRowLike[] = [
  row('学生_xue2sheng1', 1, 'xuésheng', 'học sinh', 'học sinh'),
  row('会_hui4', 1, 'huì', 'hội', 'biết; sẽ'),
  row('说_shuo1', 1, 'shuō', 'thuyết', 'nói'),
  row('汉语_han4yu3', 1, 'Hànyǔ', 'hán ngữ', 'tiếng Hán'),
  row('了_le5', 1, 'le', 'liễu', 'rồi'),
  row('了_liao3', 3, 'liǎo', 'liễu', 'hiểu rõ'),
  row('一_yi1', 1, 'yī', 'nhất', 'một'),
  row('不_bu4', 1, 'bù', 'bất', 'không'),
  row('去_qu4', 1, 'qù', 'khứ', 'đi'),
  row('看_kan4', 1, 'kàn', 'khán', 'xem'),
  row('天_tian1', 1, 'tiān', 'thiên', 'ngày'),
  row('个_ge4', 1, 'gè', 'cá', 'cái'),
  row('第_di4', 2, 'dì', 'đệ', 'thứ'),
  row('他_ta1', 1, 'tā', 'tha', 'anh ấy'),
  row('买_mai3', 1, 'mǎi', 'mãi', 'mua'),
  row('冰箱_bing1xiang1', 3, 'bīngxiāng', 'băng tương', 'tủ lạnh'),
  row('在_zai4', 1, 'zài', 'tại', 'ở'),
];
const hsk = buildHsk(ROWS);
const dict = new Map<string, DictWord[]>();
addDict(dict, [
  ['学生会', '學生會', 'xue2 sheng1 hui4', ['hội sinh viên']],
  ['电冰箱', '電冰箱', 'dian4 bing1 xiang1', ['tủ lạnh (điện)']],
  ['电', '電', 'dian4', ['điện']],
  ['北京', '', 'Bei3 jing1', ['Bắc Kinh']],
]);
const lex = { hsk, dict };
const words = (toks: ReadTok[]) => toks.map((t) => (t.kind === 'space' ? '␣' : t.kind === 'break' ? '¶' : t.t));
const pin = (toks: ReadTok[], t: string) => toks.find((x) => 't' in x && x.t === t && 'p' in x) as { p: string } | undefined;

describe('đọc văn bản tự dán: tách từ', () => {
  it('ưu tiên các từ HSK cấp thấp: 学生会说汉语 → 学生 会 说 汉语', () => {
    expect(words(segment('学生会说汉语。', lex))).toEqual(['学生', '会', '说', '汉语', '。']);
  });

  it('chỗ không có từ HSK dùng từ điển mở rộng; không có từ điển thì để chữ lẻ', () => {
    const t = segment('他买了电冰箱', lex);
    expect(words(t)).toEqual(['他', '买', '了', '电冰箱']);
    expect(t[3]).toMatchObject({ kind: 'dict', p: 'diànbīngxiāng', m: ['tủ lạnh (điện)'] });
    expect(words(segment('他买了电视', { hsk, dict: new Map() }))).toEqual(['他', '买', '了', '电', '视']);
    expect(segment('视', { hsk, dict: new Map() })[0].kind).toBe('char');
    // cần tải từ điển cho chữ chưa có từ HSK, và các chữ của từ đứng trước (từ dài hơn có thể bắt đầu từ đó)
    expect(dictNeeds('他买了电冰箱', hsk)).toEqual(['电', '了']);
  });

  it('dấu câu, chữ Latinh, khoảng trắng, xuống dòng; tên riêng', () => {
    const t = segment('他在北京 OK!\n\n汉语。', lex);
    expect(words(t)).toEqual(['他', '在', '北京', '␣', 'OK', '!', '¶', '汉语', '。']);
    expect(t[2]).toMatchObject({ kind: 'dict', p: 'Běijīng', proper: true });
  });

  it('nhiều cách đọc: chọn cấp thấp, đánh dấu máy đoán', () => {
    const t = segment('看了', lex)[1];
    expect(t).toMatchObject({ kind: 'word', p: 'le', ids: ['了_le5', '了_liao3'], alt: true });
  });

  it('biến điệu 一, 不 theo chữ sau; A 不 A, A 一 A đọc nhẹ', () => {
    expect(pin(segment('不去', lex), '不')!.p).toBe('bú');
    expect(pin(segment('不说', lex), '不')!.p).toBe('bù');
    expect(pin(segment('一个', lex), '一')!.p).toBe('yí');
    expect(pin(segment('一天', lex), '一')!.p).toBe('yì');
    expect(pin(segment('第一', lex), '一')!.p).toBe('yī');
    expect(pin(segment('看一看', lex), '一')!.p).toBe('yi');
    expect(pin(segment('去不去', lex), '不')!.p).toBe('bu');
  });

  it('pinyin từ điển: dấu thanh, viết hoa tên riêng, dấu nháy', () => {
    expect(dictPinyin('chi2 dao4')).toEqual({ p: 'chídào', tone: 2 });
    expect(dictPinyin('Bei3 jing1').p).toBe('Běijīng');
    expect(dictPinyin('nu:3 er2').p).toBe('nǚ’ér');
  });
});

describe('đọc văn bản tự dán: độ phủ, câu', () => {
  it('đếm từ đã biết theo thẻ Đọc; tên riêng không tính; từ chưa biết không lặp', () => {
    const known = new Set(['学生_xue2sheng1', '说_shuo1']);
    const c = coverage(segment('学生会说汉语。他在北京说汉语。', lex), (id) => known.has(id));
    // 学生 会 说 汉语 · 他 在 (北京 là tên riêng) 说 汉语
    expect(c.total).toBe(8);
    expect(c.known).toBe(3);
    expect(c.unknown.map((t) => ('t' in t ? t.t : ''))).toEqual(['会', '汉语', '他', '在']);
  });

  it('chia câu ở 。！？ và xuống dòng', () => {
    const s = sentences(segment('他说汉语。看了！\n去不去', lex));
    expect(s.map((x) => words(x).join(''))).toEqual(['他说汉语。', '看了！', '去不去']);
  });
});

describe('bài đọc có sẵn token, tên riêng', () => {
  it('fromTokens: từ HSK lấy cấp, Hán Việt, nghĩa; [chữ, pinyin] là tên riêng; dấu câu', () => {
    const toks = fromTokens(
      [['陈安', 'Chén Ān'], ['，'], ['你好', 'nǐ hǎo', '你好_ni3hao3'], ['！']],
      (id) => (id === '你好_ni3hao3' ? { lv: 1, hv: 'nễ hảo', m: 'xin chào' } : undefined),
    );
    expect(toks.map((t) => t.kind)).toEqual(['dict', 'punct', 'word', 'punct']);
    expect(toks[0]).toMatchObject({ t: '陈安', p: 'Chén Ān', proper: true });
    expect(toks[2]).toMatchObject({ ids: ['你好_ni3hao3'], lv: 1, hv: 'nễ hảo', m: 'xin chào', tone: 3 });
    // tên riêng không tính vào độ phủ
    expect(coverage(toks, () => false).total).toBe(1);
  });

  it('Hán Việt của tên riêng: chọn âm theo pinyin, viết hoa; thiếu chữ thì bỏ', () => {
    const recs: Record<string, { py: string[]; hv: Record<string, string[]> }> = {
      河: { py: ['he2'], hv: { he2: ['hà'] } },
      内: { py: ['nei4'], hv: { nei4: ['nội'] } },
      长: { py: ['chang2', 'zhang3'], hv: { chang2: ['trường'], zhang3: ['trưởng'] } },
      安: { py: ['an1'], hv: { an1: ['an'] } },
    };
    const rec = (c: string) => recs[c];
    expect(nameHanviet('河内', 'Hénèi', rec)).toBe('Hà Nội');
    expect(nameHanviet('长安', 'Cháng’ān', rec)).toBe('Trường An');
    expect(nameHanviet('长安', 'Zhǎng Ān', rec)).toBe('Trưởng An');
    expect(nameHanviet('河北', 'Héběi', rec)).toBe('');
    expect(nameHanviet('Anna', 'Anna', rec)).toBe('');
  });
});
