import { describe, expect, it } from 'vitest';
import { parseNumbered } from '../../src/lib/pinyin';
import { strokePath } from '../../src/lib/strokes';
import { dictShardOf } from '../../src/schema/data';
import { HanvietIndex, Issues, WordSet, desandhi, matchEntries, wordSyls } from '../../scripts/data/build';
import { chunkEven } from '../../scripts/data/emit';
import {
  parseCedictRef,
  parseDict,
  parseHanviet,
  parseKrmanikAnki,
  parseStd21Words,
  parseSyllabusWords,
  splitPos,
} from '../../scripts/data/parse';

const key = (syls: { base: string; tone: number }[] | null | undefined) => syls?.map((y) => y.base + y.tone).join('') ?? null;

describe('đọc nguồn', () => {
  it('bảng đề cương 2025: sửa dòng có pinyin bị tách sang cột từ loại', () => {
    const rows = parseSyllabusWords(
      'word\tlevel\talso\tpinyin\tpos\n不客气\t1\t\tbú\tkèqi\n好\t1\t2,4\thǎo\t形、（副）、（动）\n过意不去\t7\t\tguò\tyì bú qù\n',
    );
    expect(rows[0]).toEqual({ s: '不客气', level: 1, also: [], pinyin: 'bú kèqi', pos: [] });
    expect(rows[1]).toEqual({ s: '好', level: 1, also: [2, 4], pinyin: 'hǎo', pos: ['形', '副', '动'] });
    expect(rows[2].pinyin).toBe('guò yì bú qù');
  });
  it('từ loại', () => {
    expect(splitPos('动、名')).toEqual(['动', '名']);
    expect(splitPos('')).toEqual([]);
  });
  it('krmanik: cấp kèm cấp phụ', () => {
    const [r] = parseKrmanikAnki('好\t好\thǎo\tㄏㄠˇ\t1（2）（4）\t形、（副）、（动）\t1\t<div/>');
    expect(r).toEqual({ s: '好', pinyin: 'hǎo', level: 1, also: [2, 4], pos: ['形', '副', '动'] });
    expect(parseKrmanikAnki('词\t詞\tcí\tㄘˊ\t7-9\t名\t0\t')[0].level).toBe(7);
  });
  it('chuẩn 2021: biến thể, ví dụ, phần tuỳ chọn, số đồng tự, mẫu ngữ pháp', () => {
    const csv = [
      'ID,Simplified,Traditional,Pinyin,POS,Level,WebNo,WebPinyin,OCR,Variants,CEDICT',
      'L1-0004,爸爸|爸,爸爸|爸,bàba|bà,N,1,83,bàba|bà,爸爸｜爸,"[{""Simplified"": ""爸爸"", ""Pinyin"": ""bàba"", ""Traditional"": ""爸爸"", ""CEDICT"": ""爸爸|爸爸[ba4 ba5]""}, {""Simplified"": ""爸"", ""Pinyin"": ""bà"", ""Traditional"": ""爸"", ""CEDICT"": ""爸|爸[ba4]""}]",爸爸|爸爸[ba4 ba5]',
      'L1-0075,第（第二）,第（第二）,dì (dì-èr),Prefix,1,1792,dì (dì-èr),第（第二）,"[{""Simplified"": ""第"", ""Pinyin"": ""dì"", ""Traditional"": ""第"", ""CEDICT"": ""第|第[di4]""}, {""Simplified"": ""第二"", ""Pinyin"": ""dì-èr"", ""Example"": ""1"", ""Traditional"": ""第二"", ""CEDICT"": ""第二|第二[di4 er4]""}]",第|第[di4]',
      'L2-0001,有（一）些,有（一）些,yǒu(yī)xiē,,2,1,,,,',
      'L3-0001,称1,稱,chēng,V,3,1,,,,稱|称[cheng1]',
      'L3-0002,…极了,…極了,…jí le,,3,1,,,,',
      'L3-0003,台,台|臺,tái,N/M,3,1,,,,台|台[tai2]/臺|台[tai2]',
    ].join('\n');
    const rows = parseStd21Words(csv);
    expect(rows.map((r) => r.s)).toEqual(['爸爸', '爸', '第', '有一些', '有些', '称', '台']);
    expect(rows.find((r) => r.s === '爸爸')?.numbered).toBe('ba4 ba5');
    expect(rows.find((r) => r.s === '称')).toMatchObject({ t: '稱', numbered: 'cheng1' });
    expect(rows.find((r) => r.s === '有些')?.marked).toBe('yǒuxiē');
    expect(rows.find((r) => r.s === '台')?.t).toBe('台|臺');
  });
  it('tham chiếu CC-CEDICT', () => {
    expect(parseCedictRef('愛好|爱好[ai4 hao4]')).toEqual({ t: '愛好', s: '爱好', numbered: 'ai4 hao4' });
    expect(parseCedictRef('起來|起来[qi3 lai5]/起來|起来[qi5 lai5]')?.numbered).toBe('qi3 lai5');
  });
  it('CVDICT: lượng từ, rút gọn tham chiếu, tên riêng', () => {
    const [a, b] = parseDict(
      '# chú thích\n愛好 爱好 [ai4 hao4] /thích; đam mê/sở thích/LT:個|个[ge4]/\n中國 中国 [Zhong1 guo2] /Trung Quốc/xem 中華|中华[Zhong1 hua2]/\n',
    );
    expect(a).toMatchObject({ s: '爱好', t: '愛好', glosses: ['thích; đam mê', 'sở thích'], cl: ['个'], cap: false });
    expect(key(a.syls)).toBe('ai4hao4');
    expect(b.cap).toBe(true);
    expect(b.glosses[1]).toBe('xem 中华[Zhong1 hua2]');
  });
  it('Hán Việt', () => {
    const rows = parseHanviet("char,hanviet,pinyin\n好,['hảo'],hao3\n好,\"['hiếu', 'hảo']\",hao4\n女,['nữ'],nu:3\n學,['học'],*\n");
    expect(rows[1]).toEqual({ c: '好', readings: ['hiếu', 'hảo'], key: 'hao4' });
    expect(rows[2].key).toBe('nv3');
    expect(rows[3].key).toBe('*');
  });
});

describe('dựng từ', () => {
  it('bỏ biến điệu của 一 và 不', () => {
    expect(key(desandhi('一下', parseNumbered('yi2 xia4')!))).toBe('yi1xia4');
    expect(key(desandhi('不客气', parseNumbered('bu2 ke4 qi5')!))).toBe('bu4ke4qi5');
    expect(key(desandhi('对不起', parseNumbered('dui4 bu5 qi3')!))).toBe('dui4bu5qi3');
  });
  it('tách âm tiết theo từ điển khi nguồn thiếu dấu nháy', () => {
    const r = wordSyls('感恩', 'gǎnēn', [parseNumbered('gan3 en1')!]);
    expect(key(r?.syls)).toBe('gan3en1');
    expect(r?.how).toBe('dict');
    expect(key(wordSyls('一点儿', 'yìdiǎnr')?.syls)).toBe('yi1dian3r5');
    expect(key(wordSyls('墨水儿', 'mòshuǐer')?.syls)).toBe('mo4shui3r5');
    expect(wordSyls('谁', 'shéi/shuí')?.display).toBe('shéi');
  });
  it('gộp mục đề cương, giữ cấp thấp nhất; mục krmanik phải có trong từ điển', () => {
    const issues = new Issues();
    const dict: Record<string, string[]> = { 只: ['zhi1', 'zhi3'], 线上: ['xian4 shang4'] };
    const ws = new WordSet(issues, (s) => (dict[s] ?? []).map((p) => parseNumbered(p)!));
    ws.add2025({ s: '只', level: 1, also: [], pinyin: 'zhī', pos: ['量'] }, 'h');
    ws.add2025({ s: '只', level: 3, also: [], pinyin: 'zhǐ', pos: ['副'] }, 'k');
    ws.add2025({ s: '线上', level: 4, also: [], pinyin: 'xiànshàng', pos: ['名'] }, 'h');
    ws.add2025({ s: '线上', level: 4, also: [], pinyin: 'xiàshàng', pos: ['名'] }, 'k');
    ws.add2025({ s: '只', level: 2, also: [5], pinyin: 'zhī', pos: ['名'] }, 'k');
    expect(ws.all().map((w) => w.id).sort()).toEqual(['只_zhi1', '只_zhi3', '线上_xian4shang4']);
    const zhi1 = ws.byId.get('只_zhi1')!;
    expect(zhi1.lv.e25).toBe(1);
    expect([...zhi1.also].sort()).toEqual([2, 5]);
    expect(issues.count('warn:k-bo-qua-khong-co-trong-tu-dien')).toBe(1);
  });
  it('gắn cấp 2021 theo pinyin không thanh khi thanh nhẹ khác nhau', () => {
    const ws = new WordSet(new Issues());
    ws.add2025({ s: '关系', level: 3, also: [], pinyin: 'guānxì', pos: [] }, 'h');
    ws.attach('s21', '关系', parseNumbered('guan1 xi5')!, 3, '關係');
    expect(ws.all()).toHaveLength(1);
    expect(ws.byId.get('关系_guan1xi4')?.lv).toEqual({ e25: 3, s21: 3 });
  });
  it('khớp mục từ điển: đủ thanh → bỏ qua thanh nhẹ → không thanh; ưu tiên chữ thường', () => {
    const cands = parseDict('和 和 [He2] /họ Hà/\n和 和 [he2] /và/\n和 和 [huo4] /trộn/\n');
    const w = { s: '和', syls: parseNumbered('he2')! };
    expect(matchEntries(w, cands).map((c) => c.glosses[0])).toEqual(['và']);
  });
  it('Hán Việt: đúng âm, thanh nhẹ, không gắn pinyin, gần đúng', () => {
    const hv = new HanvietIndex(
      parseHanviet("char,hanviet,pinyin\n子,['tử'],zi3\n學,['học'],*\n長,['trường'],chang2\n長,['trưởng'],zhang3\n"),
    );
    expect(hv.lookup('長', '长', { base: 'zhang', tone: 3 })).toEqual([['trưởng'], false]);
    expect(hv.lookup('子', '子', { base: 'zi', tone: 5 })).toEqual([['tử'], false]);
    expect(hv.lookup('學', '学', { base: 'xue', tone: 2 })).toEqual([['học'], false]);
    expect(hv.lookup('長', '长', { base: 'zhang', tone: 4 })).toEqual([['trường', 'trưởng'], true]);
  });
});

describe('xuất dữ liệu', () => {
  it('chia khối dưới ngân sách gzip', () => {
    const items = Array.from({ length: 5000 }, (_, i) => ({ i, text: `mục ${i} ${Math.sin(i).toFixed(8)}` }));
    const { per, chunks } = chunkEven(items, (c) => ({ c }), 20_000);
    expect(chunks.flat()).toHaveLength(5000);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length <= per && Buffer.byteLength(JSON.stringify({ c })) <= 20_000)).toBe(true);
  });
  it('đường dẫn nét và mã tệp từ điển', () => {
    expect(strokePath('好')).toBe('apl/strokes/2.0.1/u597d.json');
    expect(dictShardOf('爱好')).toBe('31');
  });
});
