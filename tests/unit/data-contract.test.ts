/**
 * Hợp đồng dữ liệu: kiểm tra public/data/ (do `npm run data` sinh) khớp schema; không còn gói nội dung bài học.
 * Bỏ qua nếu chưa sinh dữ liệu.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkOf } from '../../src/lib/data';
import { strokePath } from '../../src/lib/strokes';
import {
  AudioIndex,
  CharPack,
  DictShard,
  LevelList,
  Manifest,
  PinyinNotesPack,
  RadicalsPack,
  SearchPack,
  WordPack,
  type CharRec,
  type PackKey,
  type WordRec,
} from '../../src/schema/data';

const DIR = 'public/data';
const has = existsSync(path.join(DIR, 'manifest.json'));
const read = (rel: string) => JSON.parse(readFileSync(path.join(DIR, rel), 'utf8')) as unknown;

describe.skipIf(!has)('dữ liệu đã sinh', () => {
  const manifest = has ? Manifest.parse(read('manifest.json')) : (null as never);
  const keys = has ? (Object.keys(manifest.levels) as PackKey[]) : [];

  it('manifest trỏ tới tệp có thật, đúng thư mục giấy phép', () => {
    const files = [
      ...Object.values(manifest.levels),
      ...keys.flatMap((k) => [...manifest.words[k].files, ...manifest.chars[k].files, ...manifest.search[k].files]),
      ...Object.values(manifest.dict.files).map((f) => manifest.dict.dir + f),
    ];
    for (const f of files) {
      expect(existsSync(path.join(DIR, f)), f).toBe(true);
      expect(f).toMatch(/^(sa|apl|lgpl|mit|by)\//);
    }
  });

  it('mọi gói theo đúng schema; danh sách cấp và chỉ mục khớp gói', () => {
    for (const k of keys) {
      const list = LevelList.parse(read(manifest.levels[k]));
      const packs = manifest.words[k].files.map((f) => WordPack.parse(read(f)));
      const ids = packs.flatMap((p) => p.words.map((w) => w.id));
      expect(ids.length).toBe(manifest.counts.words[k]);
      const chars = manifest.chars[k].files.flatMap((f) => CharPack.parse(read(f)).chars);
      expect(chars.map((c) => c.c)).toEqual(list.chars);
      const rows = manifest.search[k].files.flatMap((f) => SearchPack.parse(read(f)).rows);
      expect(rows.map((r) => r[0])).toEqual(ids);
      // Tra từ hiện đúng pinyin, Hán Việt, cấp như trang từ
      const words = packs.flatMap((p) => p.words);
      rows.forEach(([id, lv, p, hv], i) => {
        const w = words[i];
        expect([lv, p, hv], id).toEqual([w.lv.e25 ?? 0, w.p, (w.hv ?? []).map((x) => x?.[0]).filter(Boolean).join(' ')]);
      });
      // mở được trang của mọi từ: `first` + tìm nhị phân trỏ đúng khối (data.ts dựa vào quy tắc này)
      expect(manifest.words[k].first).toEqual(packs.map((p) => p.words[0].id));
      ids.forEach((id) => {
        expect(packs[chunkOf(manifest.words[k].first, id)].words.some((w) => w.id === id), id).toBe(true);
      });
      // mở được trang của mọi chữ: vị trí trong danh sách cấp / per = khối chứa chữ (loadChar dựa vào quy tắc này)
      const charPacks = manifest.chars[k].files.map((f) => CharPack.parse(read(f)).chars);
      list.chars.forEach((c, i) => {
        expect(charPacks[Math.floor(i / manifest.chars[k].per)].some((x) => x.c === c), c).toBe(true);
      });
    }
  });

  it('nét chữ: có cho mọi chữ của hanzi-writer-data (kể cả ngoài HSK); chữ viết tay mỗi cấp xếp từ ít nét đến nhiều nét', () => {
    const dir = path.join(DIR, manifest.strokes.dir);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(manifest.counts.strokes);
    expect(files.length).toBeGreaterThan(9000);
    for (const c of ['鬱', '龜', '爾', '好']) expect(existsSync(path.join(DIR, strokePath(c))), c).toBe(true);
    const all = new Map<string, CharRec>();
    for (const k of keys) for (const f of manifest.chars[k].files) for (const c of CharPack.parse(read(f)).chars) all.set(c.c, c);
    let total = 0;
    for (const k of keys) {
      const w = LevelList.parse(read(manifest.levels[k])).writing;
      total += w.length;
      const sc = w.map((c) => all.get(c)?.sc ?? 99);
      sc.forEach((n, i) => i > 0 && expect(n, `${k}: ${w[i - 1]} ${w[i]}`).toBeGreaterThanOrEqual(sc[i - 1]));
    }
    expect(total).toBe(1200);
  });

  it('từ điển mở rộng theo schema', () => {
    let n = 0;
    for (const f of Object.values(manifest.dict.files)) n += DictShard.parse(read(manifest.dict.dir + f)).entries.length;
    expect(n).toBe(manifest.counts.dict);
  });

  it('HSK 1 đủ nghĩa Việt, Hán Việt; chữ viết tay có nét', () => {
    const words: WordRec[] = manifest.words['1'].files.flatMap((f) => WordPack.parse(read(f)).words);
    expect(words.length).toBeGreaterThanOrEqual(297);
    for (const w of words) {
      expect(w.vi?.length, w.id).toBeGreaterThan(0);
      expect(w.hv, w.id).toBeDefined();
    }
    const chars = manifest.chars['1'].files.flatMap((f) => CharPack.parse(read(f)).chars);
    for (const c of chars.filter((x) => x.lv.w25)) {
      expect(c.st, c.c).toBe(1);
      expect(existsSync(path.join(DIR, strokePath(c.c))), c.c).toBe(true);
    }
  });

  it('âm thanh người thật: tệp có thật, đủ âm tiết, phần lớn từ HSK 1 có bản ghi', () => {
    const a = AudioIndex.parse(read(manifest.audio));
    expect(a.s.keys.length).toBeGreaterThan(1500);
    for (const k of ['ma1', 'ma2', 'ma3', 'ma4', 'lv4', 'nv3', 'zhong1', 'xue2']) expect(a.s.keys, k).toContain(k);
    for (const k of a.s.keys) expect(existsSync(path.join(DIR, `${a.s.dir}${k}.mp3`)), k).toBe(true);
    for (const f of Object.values(a.w.ids)) expect(existsSync(path.join(DIR, `${a.w.dir}${f}.mp3`)), f).toBe(true);
    const lv1 = manifest.words['1'].files.flatMap((f) => WordPack.parse(read(f)).words.map((w) => w.id));
    expect(lv1.filter((id) => a.w.ids[id]).length / lv1.length).toBeGreaterThan(0.8);
    // từ có nhiều cách đọc (好 hǎo/hào) không gắn bản ghi
    expect(a.w.ids['好_hao3']).toBeUndefined();
  });

  it('ghi chú phát âm: có ghi chú cho các âm khó, mọi âm tiết so sánh đều có bản ghi', () => {
    const notes = PinyinNotesPack.parse(read(manifest.pinyinNotes));
    const a = AudioIndex.parse(read(manifest.audio));
    expect(notes.status).toBe('draft');
    const sounds = new Set(notes.notes.flatMap((n) => n.sounds));
    for (const s of ['zh', 'ch', 'sh', 'z', 'c', 's', 'j', 'q', 'x', 'r', 'er']) expect(sounds, s).toContain(s);
    for (const k of notes.notes.flatMap((n) => n.pairs.flat())) expect(a.s.keys, k).toContain(k);
  });

  it('bộ thủ: 214 bộ theo Unicode; mọi dạng bộ của chữ cấp 1–2 có số bộ', () => {
    const pack = RadicalsPack.parse(read(manifest.radicals));
    expect(pack.radicals.map((r) => r.n)).toEqual(Array.from({ length: 214 }, (_, i) => i + 1));
    expect(pack.radicals[84]).toMatchObject({ n: 85, c: '水' });
    expect(pack.forms['氵']).toBe(85);
    expect(pack.forms['亻']).toBe(9);
    expect(pack.forms['讠']).toBe(149);
    for (const c of ['都', '那', '部']) expect(pack.cityRight, c).toContain(c);
    for (const c of ['陈', '院']) expect(pack.cityRight, c).not.toContain(c);
    expect(pack.radicals.filter((r) => r.hv?.length).length).toBeGreaterThan(200);
    const chars: CharRec[] = (['1', '2'] as const).flatMap((k) => manifest.chars[k].files.flatMap((f) => CharPack.parse(read(f)).chars));
    for (const c of chars) if (c.rad) expect(pack.forms[c.rad], `${c.c} (${c.rad})`).toBeDefined();
    // chữ theo bộ (trang Bộ thủ): 水 có 汉, 海; 陈 thuộc bộ 阜 (170), 都 thuộc bộ 邑 (163); chữ cấp thấp đứng trước
    expect(pack.radicals[84].ch).toMatch(/^水汉/);
    expect(pack.radicals[84].ch).toContain('海');
    expect(pack.radicals[169].ch).toContain('陈');
    expect(pack.radicals[162].ch).toContain('都');
  });

  it('một số từ mẫu', () => {
    const words = manifest.words['1'].files.flatMap((f) => WordPack.parse(read(f)).words);
    const get = (id: string) => words.find((w) => w.id === id);
    expect(get('爱好_ai4hao4')).toBeUndefined(); // 爱好 thuộc cấp 2 trong đề cương 2025
    expect(get('一下_yi1xia4')).toMatchObject({ p: 'yíxià', hv: [['nhất'], ['hạ']] });
    expect(get('一点儿_yi1dian3r5')?.hv?.[2]).toBeNull();
    expect(get('只_zhi1')).toMatchObject({ t: '隻', hv: [['chích']] });
    expect(get('后_hou4')).toMatchObject({ t: '後' });
    expect(get('女儿_nv3er2')?.p).toBe('nǚ’ér');
  });
});
