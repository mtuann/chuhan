/**
 * Pipeline dữ liệu: fetch → parse → join → validate → emit.  Chạy: `npm run data`.
 *
 * Cờ:
 *   --force         dựng lại kể cả khi đầu vào không đổi
 *   --update-lock   tải lại nguồn và ghi sha256 mới vào sources.lock.json (khi đổi commit)
 *   --offline       chỉ dùng cache .cache/sources
 */
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SYLLABLES, parseNumbered, splitMarked, sylsToKey, type Syl } from '../../src/lib/pinyin.ts';
import { STROKES_VERSION, strokePath } from '../../src/lib/strokes.ts';
import {
  AudioIndex,
  CharPack,
  DATA_VERSION,
  DictShard,
  E25_LEVELS,
  LevelList,
  Manifest,
  PACK_KEYS,
  SearchPack,
  WordPack,
  dictShardOf,
  type CharRec,
  type DictEntry,
  type PackKey,
  type SearchRow,
  type WordRec,
} from '../../src/schema/data.ts';
import {
  HanvietIndex,
  Issues,
  WordSet,
  attachGlosses,
  attachHanviet,
  buildChar,
  fillTraditional,
  isHan,
  toRecord,
} from './build.ts';
import { fetchAudio, type AudioSource } from './audio.ts';
import { CONTENT_DIR, listContentFiles, loadPinyinNotes } from './content.ts';
import { applyDataFixes, loadDataFixes } from './fixes.ts';
import { buildRadicals, parseUnicodeRadicals } from './radicals.ts';
import { Emitter, MAX_GZIP, OUT_DIR, RAW_BUDGET, chunkEven, gzipSize } from './emit.ts';
import {
  parseChv,
  parseChvRank,
  parseDict,
  parseHanviet,
  parseHsk20,
  parseKrmanikAnki,
  parseMmah,
  parseStd21Chars,
  parseStd21Words,
  parseSyllabusChars,
  parseSyllabusWords,
} from './parse.ts';
import { fetchSources, LOCK_PATH } from './sources.ts';
import { measureTones, renderToneTable } from './tones.ts';
import { validateAll } from './validate.ts';

const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const log = (m: string) => console.log(m);
const FINGERPRINT = '.cache/data-fingerprint';
const SUMMARY = 'scripts/data/summary.json';
const ISSUES = '.cache/data-issues.txt';

// ------------------------------------------------------------------ bỏ qua nếu đầu vào không đổi

async function fingerprint(): Promise<string> {
  const h = createHash('sha256');
  const files = [
    LOCK_PATH,
    'package-lock.json',
    'src/lib/pinyin.ts',
    'src/lib/hanviet.ts',
    'src/schema/data.ts',
    ...(await readdir('scripts/data')).filter((f) => f.endsWith('.ts')).map((f) => `scripts/data/${f}`),
    ...(await listContentFiles()),
  ].sort();
  for (const f of files) h.update(f).update(await readFile(f));
  return h.digest('hex');
}

const fp = await fingerprint();
if (!args.has('--force') && !args.has('--update-lock') && existsSync(path.join(OUT_DIR, 'manifest.json'))) {
  const prev = existsSync(FINGERPRINT) ? (await readFile(FINGERPRINT, 'utf8')).trim() : '';
  if (prev === fp) {
    log('[data] dữ liệu đã mới, bỏ qua (dùng --force để dựng lại)');
    process.exit(0);
  }
}

// ------------------------------------------------------------------ fetch + parse

const { lock, files } = await fetchSources({ updateLock: args.has('--update-lock'), offline: args.has('--offline'), log });
const read = (id: string, key: string) => readFile(files[id][key], 'utf8');
const L7 = [1, 2, 3, 4, 5, 6, 7];

const syllabusWords = parseSyllabusWords(await read('syllabus25', 'words'));
const syllabusChars = parseSyllabusChars(await read('syllabus25', 'chars'));
const writingChars = parseSyllabusChars(await read('syllabus25', 'writing'));
const krRaw = (await Promise.all(L7.map((i) => read('krmanik25', `anki${i}`)))).flatMap(parseKrmanikAnki);
const krRows = [...new Map(krRaw.map((r) => [`${r.s}|${r.pinyin}|${r.level}|${r.also.join(',')}`, r])).values()];
const std21Words = parseStd21Words(await read('std21', 'words'));
const std21Chars = parseStd21Chars(await read('std21', 'chars'));
const hsk20 = (await Promise.all([1, 2, 3, 4, 5, 6].map(async (i) => parseHsk20(await read('hsk20', `l${i}`), i)))).flat();
const cvdict = parseDict(await read('cvdict', 'dict'));
const hanvietRows = parseHanviet(await read('hanviet', 'list'));
const mmah = parseMmah(await read('mmah', 'dictionary'));
const chvJson = await read('chv', 'complete');
const chv = parseChv(chvJson);
const chvRank = parseChvRank(chvJson);
log(`[data] đã đọc nguồn (${((Date.now() - t0) / 1000).toFixed(1)}s): CVDICT ${cvdict.length} mục, Hán Việt ${hanvietRows.length} dòng`);

// ------------------------------------------------------------------ từ

const issues = new Issues();
const cvBySimp = new Map<string, typeof cvdict>();
for (const d of cvdict) {
  const list = cvBySimp.get(d.s) ?? [];
  list.push(d);
  cvBySimp.set(d.s, list);
}
// Các cách đọc theo từ điển của một chuỗi: CVDICT (mục chữ thường trước), complete-hsk-vocabulary, chuẩn 2021.
const std21Readings = new Map<string, Syl[][]>();
for (const r of std21Words) {
  const syls = r.numbered ? parseNumbered(r.numbered) : null;
  if (syls) std21Readings.set(r.s, [...(std21Readings.get(r.s) ?? []), syls]);
}
const readings = (s: string): Syl[][] => {
  const out = new Map<string, Syl[]>();
  const cv = cvBySimp.get(s) ?? [];
  for (const d of [...cv.filter((x) => !x.cap), ...cv.filter((x) => x.cap)]) if (d.syls) out.set(sylsToKey(d.syls), d.syls);
  for (const f of chv.get(s) ?? []) if (f.syls) out.set(sylsToKey(f.syls), f.syls);
  for (const y of std21Readings.get(s) ?? []) out.set(sylsToKey(y), y);
  return [...out.values()];
};
const fixes = await loadDataFixes();
const ws = new WordSet(issues, readings, new Map(Object.entries(fixes.pinyin ?? {})));
for (const r of syllabusWords) ws.add2025(r, 'h');
for (const r of krRows) ws.add2025(r, 'k');
ws.addStd21(std21Words, parseNumbered);
ws.addHsk20(hsk20);
const drafts = ws.all();
const hsk20En = new Map<string, { syls: (typeof hsk20)[number]['syls']; en: string }[]>();
for (const h of hsk20) hsk20En.set(h.s, [...(hsk20En.get(h.s) ?? []), { syls: h.syls, en: h.en }]);
attachGlosses(drafts, { cvdict: cvBySimp, chv, hsk20En }, issues);
const pairCount = fillTraditional(drafts, issues);
const hv = new HanvietIndex(hanvietRows);
attachHanviet(drafts, hv, issues);
const words: WordRec[] = drafts.map(toRecord).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const wordKey = (w: WordRec): PackKey => (w.lv.e25 !== undefined ? (String(w.lv.e25) as PackKey) : 'x');

// ------------------------------------------------------------------ chữ

const strokesSrc = files.strokes.dir;
const strokesVersion = lock.sources.find((s) => s.id === 'strokes')!.version!;
const r25 = new Map(syllabusChars.map((c) => [c.c, c.level]));
const w25 = new Map(writingChars.map((c) => [c.c, c.level]));
const std21CharMap = new Map(std21Chars.map((c) => [c.c, c]));
const charSet = new Set<string>([...r25.keys(), ...w25.keys(), ...std21CharMap.keys()]);
const readingsInWords = new Map<string, Set<string>>();
for (const d of drafts) {
  [...d.s].forEach((c, i) => {
    if (!isHan(c)) return;
    charSet.add(c);
    const y = d.syls[i];
    if (!y || y.base === 'r' || y.tone === 5) return;
    const set = readingsInWords.get(c) ?? new Set<string>();
    set.add(`${y.base}${y.tone}`);
    readingsInWords.set(c, set);
  });
}
const strokeJson = new Map<string, string>();
const strokeCount = new Map<string, number>();
await Promise.all(
  [...charSet].map(async (c) => {
    const f = path.join(strokesSrc, `${c}.json`);
    if (!existsSync(f)) return;
    const raw = await readFile(f, 'utf8');
    const j = JSON.parse(raw) as { strokes: string[] };
    strokeJson.set(c, JSON.stringify(j));
    strokeCount.set(c, j.strokes.length);
  }),
);
const markedToNumbered = (p: string) => {
  const s = splitMarked(p, 1);
  return s ? `${s[0].base}${s[0].tone}` : null;
};
const chars: CharRec[] = [...charSet]
  .sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!)
  .map((c) => buildChar(c, { r25, w25, std21: std21CharMap, mmah, hv, strokes: strokeCount, pairCount, readingsInWords }, markedToNumbered));
const charKey = (c: CharRec): PackKey => (c.lv.r25 ? (String(c.lv.r25) as PackKey) : 'x');

const pinyinNotes = await loadPinyinNotes();

// Ghi đè sửa lỗi dữ liệu theo từng từ/mục (content/*-fixes.yaml): chạy sau mọi nguồn
// và sau overlays nội dung, để bản sửa luôn thắng.
applyDataFixes(words, fixes, issues);

// bộ thủ: số bộ Khang Hy và dạng biến thể (Unicode), âm Hán Việt của chữ bộ, tên gọi khác có nguồn
const radicals = buildRadicals({
  unicode: parseUnicodeRadicals(await read('unicode', 'radicals'), await read('unicode', 'equivalent')),
  forms: chars.flatMap((c) => (c.rad ? [c.rad] : [])),
  // 阝 bên phải là bộ 邑 (163), bên trái là bộ 阜 (170): xét cấu tạo của Make Me a Hanzi (kể cả phần chưa rõ ？)
  cityRight: chars.filter((c) => c.rad === '阝' && /^⿰.+阝$/u.test(mmah.get(c.c)?.decomposition ?? '')).map((c) => c.c),
  hanviet: (c) => {
    const m = mmah.get(c);
    const main = m?.pinyin?.[0] ? markedToNumbered(m.pinyin[0]) : null;
    const first = main ? (hv.exact.get(`${c}|${main}`) ?? []) : [];
    return [...new Set([...first, ...(hv.any.get(c) ?? [])])].slice(0, 3);
  },
  file: existsSync(path.join(CONTENT_DIR, 'radicals.yaml')) ? parseYaml(await readFile(path.join(CONTENT_DIR, 'radicals.yaml'), 'utf8')) : undefined,
});

// chữ HSK theo bộ (trang Bộ thủ): cấp thấp trước, cùng cấp thì ít nét trước
{
  const byRad = new Map<number, CharRec[]>();
  for (const c of chars) {
    const lv = c.lv.r25 ?? c.lv.w25;
    if (!lv || !c.rad) continue;
    const n = c.rad === '阝' && radicals.pack.cityRight.includes(c.c) ? 163 : radicals.pack.forms[c.rad];
    if (n) byRad.set(n, [...(byRad.get(n) ?? []), c]);
  }
  const lvOf = (c: CharRec) => c.lv.r25 ?? c.lv.w25 ?? 99;
  for (const r of radicals.pack.radicals) {
    const list = byRad.get(r.n);
    if (list?.length) r.ch = list.sort((a, b) => lvOf(a) - lvOf(b) || (a.sc ?? 99) - (b.sc ?? 99) || a.c.codePointAt(0)! - b.c.codePointAt(0)!).map((c) => c.c).join('');
  }
}

// ------------------------------------------------------------------ mẹo thanh (đo lại)

// Mỗi chữ đọc HSK 2025 → các dạng phồn thể (nếu có) có trong bảng Hán Việt; không có thì chính chữ đó.
const charByC = new Map(chars.map((c) => [c.c, c]));
const charForms = syllabusChars.map(({ c }) => {
  const trad = (charByC.get(c)?.t ?? []).filter((f) => hv.rows.has(f));
  return { c, forms: trad.length ? trad : hv.rows.has(c) ? [c] : [] };
});
const tones = measureTones(charForms, hv, (form) => {
  const m = mmah.get(form);
  if (!m?.pinyin || m.pinyin.length !== 1) return null;
  const k = markedToNumbered(m.pinyin[0]);
  return k ? Number(k.slice(-1)) : null;
});

// ------------------------------------------------------------------ emit

const em = new Emitter();
const manifestParts = {
  levels: {} as Record<string, string>,
  words: {} as Record<string, { per: number; files: string[]; first: string[] }>,
  chars: {} as Record<string, { per: number; files: string[] }>,
  search: {} as Record<string, { per: number; files: string[] }>,
};
const levelLists: LevelList[] = [];
const offlineBytes: Record<string, number> = {};
const sizeOf = (rel: string) => {
  const f = em.files.find((x) => x.rel === rel)!;
  return typeof f.content === 'string' ? Buffer.byteLength(f.content) : f.content.length;
};

const short = (list: string[] | undefined, max = 80) => {
  const s = (list ?? []).slice(0, 3).join('; ');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

for (const key of PACK_KEYS) {
  const ws = words.filter((w) => wordKey(w) === key);
  const cs = chars.filter((c) => charKey(c) === key);
  // chữ viết tay của cấp: ít nét trước (tập viết đi từ chữ đơn giản), cùng số nét thì theo mã chữ
  const writing =
    key === 'x'
      ? []
      : chars
          .filter((c) => c.lv.w25 === Number(key))
          .sort((a, b) => (a.sc ?? 99) - (b.sc ?? 99) || a.c.codePointAt(0)! - b.c.codePointAt(0)!)
          .map((c) => c.c);
  const list = LevelList.parse({ v: DATA_VERSION, level: key, chars: cs.map((c) => c.c), writing });
  levelLists.push(list);
  manifestParts.levels[key] = em.json(`mit/levels/${key}`, list);

  const wc = chunkEven(ws, (chunk, i) => ({ v: DATA_VERSION, level: key, chunk: i, words: chunk }), RAW_BUDGET.words);
  manifestParts.words[key] = {
    per: wc.per,
    files: wc.chunks.map((chunk, i) => em.json(`sa/lv/${key}-${i}`, WordPack.parse({ v: DATA_VERSION, level: key, chunk: i, words: chunk }))),
    first: wc.chunks.map((chunk) => chunk[0].id),
  };
  const cc = chunkEven(cs, (chunk, i) => ({ v: DATA_VERSION, level: key, chunk: i, chars: chunk }), RAW_BUDGET.chars);
  manifestParts.chars[key] = {
    per: cc.per,
    files: cc.chunks.map((chunk, i) => em.json(`lgpl/chars/${key}-${i}`, CharPack.parse({ v: DATA_VERSION, level: key, chunk: i, chars: chunk }))),
  };
  // hạng tần suất (nếu có) ở cuối dòng: bộ gõ pinyin dùng để xếp chữ gợi ý
  const rows: SearchRow[] = ws.map((w) => {
    const row: SearchRow = [
      w.id,
      w.lv.e25 ?? 0,
      w.p,
      (w.hv ?? []).map((x) => x?.[0]).filter(Boolean).join(' '),
      short(w.vi),
      short(w.en),
    ];
    const q = chvRank.get(w.s);
    return q ? [...row, q] : row;
  });
  const sc = chunkEven(rows, (chunk, i) => ({ v: DATA_VERSION, level: key, chunk: i, rows: chunk }), RAW_BUDGET.search);
  manifestParts.search[key] = {
    per: sc.per,
    files: sc.chunks.map((chunk, i) => em.json(`sa/search/${key}-${i}`, SearchPack.parse({ v: DATA_VERSION, level: key, chunk: i, rows: chunk }))),
  };
}
// từ điển mở rộng (CVDICT) chia theo byte thấp của mã chữ đầu
const shards = new Map<string, DictEntry[]>();
for (const d of cvdict) {
  if (!d.glosses.length && !d.cl.length) continue;
  let glosses = d.glosses.length ? [...d.glosses] : [];
  const gf = fixes.gloss[d.s];
  const drop = gf?.drop;
  if (drop) glosses = glosses.filter((g) => !drop.includes(g));
  if (gf?.vi) glosses = [...gf.vi];
  if (d.cl.length) glosses.push(`LT: ${d.cl.join(', ')}`);
  const k = dictShardOf(d.s);
  const list = shards.get(k) ?? [];
  list.push([d.s, d.t === d.s ? '' : d.t, d.pinyin, glosses]);
  shards.set(k, list);
}
const dictFiles: Record<string, string> = {};
let dictCount = 0;
for (let i = 0; i < 256; i++) {
  const k = i.toString(16).padStart(2, '0');
  const entries = (shards.get(k) ?? []).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] < b[2] ? -1 : 1));
  dictCount += entries.length;
  dictFiles[k] = path.basename(em.json(`sa/dict/hz/${k}`, DictShard.parse({ v: DATA_VERSION, shard: k, entries })));
}

// nét chữ: thư mục theo phiên bản, tên tệp cố định (src/lib/strokes.ts)
if (STROKES_VERSION !== strokesVersion) {
  throw new Error(`src/lib/strokes.ts ghi STROKES_VERSION=${STROKES_VERSION} nhưng sources.lock.json ghi ${strokesVersion}`);
}
const strokeDir = `apl/strokes/${strokesVersion}/`;
for (const [c, json] of [...strokeJson.entries()].sort()) em.add(strokePath(c), json);
// chữ ngoài HSK cũng có nét, để xem cách viết một câu bất kỳ: chép mọi tệp chữ của hanzi-writer-data
const extraStrokes = (await readdir(strokesSrc)).map((f) => /^(.)\.json$/u.exec(f)?.[1]).filter((c): c is string => !!c && !strokeJson.has(c));
await Promise.all(
  extraStrokes.map(async (c) => {
    const j = JSON.parse(await readFile(path.join(strokesSrc, `${c}.json`), 'utf8')) as { strokes: string[] };
    em.add(strokePath(c), JSON.stringify(j));
  }),
);
const strokeFileCount = strokeJson.size + extraStrokes.length;

// giấy phép đi kèm từng thư mục
const lic = async (id: string, key: string) => readFile(files[id][key], 'utf8');
em.add('apl/ARPHICPL.TXT', await readFile(path.join(strokesSrc, 'ARPHICPL.TXT')));
em.add(
  'apl/README.txt',
  `Nét chữ: hanzi-writer-data ${strokesVersion} (David Chanin), dẫn xuất từ Make Me a Hanzi và phông Arphic PL KaitiM GB / UKai.\n` +
    'Phân phối theo Arphic Public License (xem ARPHICPL.TXT), không chỉnh sửa nội dung.\n',
);
em.add('lgpl/COPYING.LESSER', await lic('mmah', 'lgpl'));
em.add(
  'lgpl/README.txt',
  'Cấu tạo chữ, bộ, loại chữ, gợi ý nguồn gốc và nghĩa ngắn tiếng Anh lấy từ dictionary.txt của Make Me a Hanzi\n' +
    '(Shaunak Kishore, https://github.com/skishore/makemeahanzi), dẫn xuất từ Unihan và CJKlib.\n' +
    'Phân phối theo GNU LGPL phiên bản 3 hoặc mới hơn (xem COPYING.LESSER; bản GPL v3: https://www.gnu.org/licenses/gpl-3.0.html).\n' +
    'Cấp HSK, phồn thể và âm Hán Việt trong cùng tệp lấy từ các nguồn MIT (xem mit/LICENSE.txt).\n\n' +
    (await lic('mmah', 'copying')),
);
em.add(
  'sa/LICENSE.txt',
  'Các tệp trong thư mục này phân phối theo Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0):\n' +
    'https://creativecommons.org/licenses/by-sa/4.0/\n\n' +
    'Nguồn:\n' +
    '- CVDICT (Phong Phan, https://github.com/ph0ngp/CVDICT), dịch từ CC-CEDICT (MDBG): nghĩa tiếng Việt, từ điển mở rộng.\n' +
    '- CC-CEDICT qua complete-hsk-vocabulary (https://github.com/drkameleon/complete-hsk-vocabulary): nghĩa tiếng Anh.\n' +
    '- krmanik/HSK-3.0 (Mani, https://github.com/krmanik/HSK-3.0): điểm ngữ pháp đề cương 2025, mục đồng tự khác âm.\n' +
    'Đã chỉnh sửa: chọn lọc, gộp theo từ HSK, rút gọn tham chiếu phồn thể. Nghĩa tiếng Việt là bản máy dịch, chưa duyệt.\n' +
    '- Ghi chú phát âm (notes/): nội dung tự soạn của dự án (content/pinyin.yaml), AI soạn, chưa duyệt.\n' +
    '- Bộ thủ (radicals): số bộ Khang Hy và dạng biến thể theo Unicode Character Database 16.0 (CJKRadicals.txt,\n' +
    '  EquivalentUnifiedIdeograph.txt; Unicode License v3, xem UNICODE-LICENSE.txt), dạng bộ của chữ theo Make Me a Hanzi,\n' +
    '  âm Hán Việt theo bảng Hán Việt của dự án (MIT); tên gọi khác của bộ 亻, 儿 theo Wikipedia tiếng Việt\n' +
    '  (bài "Bộ thủ Khang Hy", CC BY-SA 4.0).\n\n' +
    'Âm thanh trong audio/cmn/ (CC BY-SA, không chỉnh sửa; https://github.com/hugolpz/audio-cmn):\n' +
    '- s/: âm tiết có thanh, giọng Chen Wang.\n' +
    '- w/: từ HSK 2000, giọng Yue Tan (dự án Shtooka, http://shtooka.net).\n' +
    'Biên tập, nén mp3: Hugo Lopez (PLIDAM, INALCO).\n',
);
em.add(
  'mit/LICENSE.txt',
  'Danh sách cấp HSK, phồn thể, âm Hán Việt lấy từ các nguồn theo giấy phép MIT:\n\n' +
    [
      ['harukicoder/hsk30 (đề cương thi HSK 2025)', await lic('syllabus25', 'license')],
      ['ivankra/hsk30 (chuẩn 2021)', await lic('std21', 'license')],
      ['glxxyz/hskhsk.com (HSK 2.0)', await lic('hsk20', 'license')],
      ['ph0ngp/hanviet-pinyin-wordlist (âm Hán Việt)', await lic('hanviet', 'license')],
    ]
      .map(([name, text]) => `== ${name} ==\n${text.trim()}\n`)
      .join('\n'),
);

const pinyinNotesFile = em.json('sa/notes/pinyin', pinyinNotes.pack);
const radicalsFile = em.json('sa/radicals', radicals.pack);
em.add('sa/UNICODE-LICENSE.txt', await lic('unicode', 'license'));

// âm thanh người thật (audio-cmn): âm tiết × 4 thanh; từ HSK cấp 1–3 chỉ có một cách đọc
const audioSrc = lock.sources.find((x) => x.id === 'audiocmn') as AudioSource;
const sylKeys = [...SYLLABLES].flatMap((b) => [1, 2, 3, 4].map((t) => `${b}${t}`)).sort();
const idsByString = new Map<string, string[]>();
for (const w of words) idsByString.set(w.s, [...(idsByString.get(w.s) ?? []), w.id]);
const wordKeys = [...new Set(words.filter((w) => w.lv.e25 !== undefined && w.lv.e25 <= 3).map((w) => w.s))].sort();
const audio = await fetchAudio(audioSrc, { syllables: sylKeys, words: wordKeys }, { offline: args.has('--offline'), updateLock: args.has('--update-lock'), log });
const AUDIO_DIR = 'sa/audio/cmn/';
for (const [k, buf] of audio.syllables) em.add(`${AUDIO_DIR}s/${k}.mp3`, buf);
const audioIds: Record<string, string> = {};
for (const [str, buf] of audio.words) {
  const ids = idsByString.get(str) ?? [];
  if (ids.length !== 1) continue; // nhiều cách đọc: không biết bản ghi đọc âm nào
  const name = createHash('sha256').update(str).digest('hex').slice(0, 8);
  em.add(`${AUDIO_DIR}w/${name}.mp3`, buf);
  audioIds[ids[0]] = name;
}
const audioFile = em.json(
  'sa/audio/index',
  AudioIndex.parse({ v: DATA_VERSION, s: { dir: `${AUDIO_DIR}s/`, keys: [...audio.syllables.keys()].sort() }, w: { dir: `${AUDIO_DIR}w/`, ids: audioIds } }),
);

// dung lượng tải offline theo cấp
for (const lv of E25_LEVELS) {
  let bytes = sizeOf(manifestParts.levels[lv]);
  for (const part of [manifestParts.words, manifestParts.chars, manifestParts.search]) for (const f of part[lv].files) bytes += sizeOf(f);
  for (const c of levelLists.find((l) => l.level === lv)!.chars) {
    const j = strokeJson.get(c);
    if (j) bytes += Buffer.byteLength(j);
  }
  offlineBytes[lv] = bytes;
}

const counts = {
  words: Object.fromEntries(PACK_KEYS.map((k) => [k, words.filter((w) => wordKey(w) === k).length])),
  chars: Object.fromEntries(PACK_KEYS.map((k) => [k, levelLists.find((l) => l.level === k)!.chars.length])),
  writing: Object.fromEntries(E25_LEVELS.map((k) => [k, levelLists.find((l) => l.level === k)!.writing.length])),
  dict: dictCount,
  strokes: strokeFileCount,
};
const hash = em.digest();
const manifest = Manifest.parse({
  v: DATA_VERSION,
  hash,
  strokes: { version: strokesVersion, dir: strokeDir },
  ...manifestParts,
  dict: { dir: 'sa/dict/hz/', files: dictFiles },
  counts,
  offlineBytes,
  radicals: radicalsFile,
  pinyinNotes: pinyinNotesFile,
  audio: audioFile,
});
em.add('manifest.json', JSON.stringify(manifest));

// ------------------------------------------------------------------ validate

const harukiByLevel: Record<string, number> = {};
for (const r of syllabusWords) harukiByLevel[String(r.level)] = (harukiByLevel[String(r.level)] ?? 0) + 1;
const check = validateAll({ words, chars, levels: levelLists, harukiByLevel, fixes });
// thứ tự id trong gói từ phải tăng dần (data.ts tìm khối bằng `first`)
for (const k of PACK_KEYS) {
  const ids = words.filter((w) => wordKey(w) === k).map((w) => w.id);
  if (ids.some((id, i) => i > 0 && !(ids[i - 1] < id))) check.errors.push(`Gói từ ${k}: id không tăng dần`);
}
for (const i of issues.list) if (i.kind.startsWith('error:')) check.errors.push(`${i.kind}: ${i.detail}`);
check.errors.push(...pinyinNotes.errors, ...radicals.errors);
check.warnings.push(...radicals.warnings);
let maxGzip = { rel: '', size: 0 };
let totalBytes = 0;
for (const f of em.files) {
  const size = gzipSize(f.content);
  totalBytes += typeof f.content === 'string' ? Buffer.byteLength(f.content) : f.content.length;
  if (size > maxGzip.size) maxGzip = { rel: f.rel, size };
  if (size > MAX_GZIP) check.errors.push(`Tệp ${f.rel} ${(size / 1024).toFixed(1)} KB gzip, vượt ${MAX_GZIP / 1024} KB`);
}

// ------------------------------------------------------------------ tóm tắt (commit vào repo để PR thấy khác biệt)

const krOnly = drafts.filter((d) => d.src.has('k') && !d.src.has('h')).length;
const summary = {
  dataVersion: DATA_VERSION,
  hash,
  words: {
    ...check.stats,
    total: words.length,
    inE25: words.filter((w) => w.lv.e25 !== undefined).length,
    distinctE25Strings: new Set(words.filter((w) => w.lv.e25 !== undefined).map((w) => w.s)).size,
    addedFromKrmanik: krOnly,
    withS21: words.filter((w) => w.lv.s21 !== undefined).length,
    withH20: words.filter((w) => w.lv.h20 !== undefined).length,
    onlyOldStandards: counts.words.x,
  },
  chars: { total: chars.length, withStrokes: strokeJson.size },
  dict: { entries: dictCount, shards: 256 },
  pinyinNotes: pinyinNotes.pack.notes.length,
  radicals: {
    forms: Object.keys(radicals.pack.forms).length,
    withHanviet: radicals.pack.radicals.filter((r) => r.hv).length,
    withAka: radicals.pack.radicals.filter((r) => r.aka).length,
  },
  audio: { syllables: audio.syllables.size, words: Object.keys(audioIds).length },
  tones: { rows: tones.rows, finals: tones.finals },
  issues: issues.byKind(),
  // không ghi kích thước gzip vào tóm tắt: phụ thuộc phiên bản zlib, làm tóm tắt khác nhau giữa các máy
  files: { count: em.files.length, bytes: totalBytes },
  offlineBytes,
};
await mkdir('.cache', { recursive: true });
await writeFile(ISSUES, issues.list.map((i) => `${i.kind}\t${i.detail}`).join('\n') + '\n');
await writeFile(SUMMARY, JSON.stringify(summary, null, 2) + '\n');

if (check.errors.length) {
  console.error(`\n[data] ${check.errors.length} lỗi:`);
  for (const e of check.errors.slice(0, 60)) console.error('  ✗ ' + e);
  if (check.errors.length > 60) console.error(`  … và ${check.errors.length - 60} lỗi khác`);
  console.error(`(chi tiết vấn đề nhỏ: ${ISSUES})`);
  process.exit(1);
}

await em.write();
// Bảng mẹo thanh dùng trong app: ghi lại nếu số đo đổi (tệp được commit).
const TONE_TABLE_PATH = 'src/lib/tone-table.ts';
const toneSrc = renderToneTable(tones.rows, tones.finals);
if (!existsSync(TONE_TABLE_PATH) || (await readFile(TONE_TABLE_PATH, 'utf8')) !== toneSrc) {
  await writeFile(TONE_TABLE_PATH, toneSrc);
  log(`[data] đã cập nhật ${TONE_TABLE_PATH} theo số đo mới`);
}
await writeFile(FINGERPRINT, await fingerprint() + '\n');
for (const w of check.warnings) log('[data] ⚠ ' + w);
log(
  `[data] xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s: ${words.length} từ (${summary.words.inE25} thuộc HSK 2025), ` +
    `${chars.length} chữ, ${strokeFileCount} tệp nét (${strokeJson.size} chữ HSK), ${dictCount} mục từ điển, ${em.files.length} tệp; ` +
    `tệp lớn nhất ${maxGzip.rel} ${(maxGzip.size / 1024).toFixed(1)} KB gzip`,
);
