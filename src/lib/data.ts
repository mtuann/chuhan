/**
 * Đọc dữ liệu đã sinh (public/data/) trong trình duyệt. Mọi tệp trừ manifest có băm trong tên
 * nên được service worker lưu cache vĩnh viễn; manifest đi cùng phiên bản app (precache).
 */
import type {
  AudioIndex,
  CharPack,
  CharRec,
  DictEntry,
  DictShard,
  LevelList,
  Manifest,
  PackKey,
  PinyinNotesPack,
  RadicalsPack,
  SearchPack,
  WordPack,
  WordRec,
} from '../schema/data';
import { dictShardOf } from '../schema/dict-shard';
import { strokePath } from './strokes';
import { packKey } from './text';
import { url } from './url';

/** URL đầy đủ của một tệp trong data/. */
export const dataUrl = (rel: string) => url(`data/${rel}`);
export const strokeUrl = (char: string) => dataUrl(strokePath(char));

/** Tải một tệp JSON trong data/ (đường dẫn tương đối như trong manifest). */
export async function getJson<T>(rel: string): Promise<T> {
  const res = await fetch(dataUrl(rel));
  if (!res.ok) throw new Error(`Không tải được dữ liệu ${rel} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

let manifestP: Promise<Manifest> | null = null;
export function loadManifest(): Promise<Manifest> {
  manifestP ??= getJson<Manifest>('manifest.json').catch((err: unknown) => {
    manifestP = null;
    throw err;
  });
  return manifestP;
}

const memo = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((err: unknown) => {
      memo.delete(key);
      throw err;
    });
    memo.set(key, p);
  }
  return p;
}

export function loadLevelList(key: PackKey): Promise<LevelList> {
  return once(`levels:${key}`, async () => getJson<LevelList>((await loadManifest()).levels[key]));
}

/** Toàn bộ từ của một cấp (mọi khối). */
export function loadWords(key: PackKey): Promise<WordRec[]> {
  return once(`words:${key}`, async () => {
    const m = await loadManifest();
    const packs = await Promise.all(m.words[key].files.map((f) => getJson<WordPack>(f)));
    return packs.flatMap((p) => p.words);
  });
}

/** Khối chứa `id`: các khối xếp theo id tăng dần, `first[i]` là id đầu của khối i. */
export function chunkOf(first: readonly string[], id: string): number {
  let lo = 0;
  let hi = first.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (first[mid] <= id) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Một từ theo id; `key` là cấp nếu đã biết (không thì thử lần lượt các cấp). */
export async function loadWord(id: string, key?: PackKey): Promise<WordRec | undefined> {
  const m = await loadManifest();
  const keys = key ? [key] : (Object.keys(m.words) as PackKey[]);
  for (const k of keys) {
    const { files, first } = m.words[k];
    if (!first.length || id < first[0]) continue;
    const file = files[chunkOf(first, id)];
    const pack = await once(`wordpack:${file}`, () => getJson<WordPack>(file));
    const w = pack.words.find((x) => x.id === id);
    if (w) return w;
  }
  return undefined;
}

/**
 * Một từ theo id với cấp có thể sai (từ thêm khi đọc, từ ngoài HSK 2025): không thấy trong cấp lưu
 * trên thẻ thì tìm trong mọi gói. Ranh giới IO rõ: chỉ gọi `loadWord`.
 */
export async function loadWordFallback(id: string, lv?: number): Promise<WordRec | undefined> {
  return (await loadWord(id, packKey(lv))) ?? (await loadWord(id));
}
export async function loadChar(c: string): Promise<{ rec: CharRec; key: PackKey } | undefined> {
  const m = await loadManifest();
  const keys = Object.keys(m.levels) as PackKey[];
  const lists = await Promise.all(keys.map((k) => loadLevelList(k)));
  for (let j = 0; j < keys.length; j++) {
    const i = lists[j].chars.indexOf(c);
    if (i < 0) continue;
    const { per, files } = m.chars[keys[j]];
    const file = files[Math.floor(i / per)];
    const pack = await once(`charpack:${file}`, () => getJson<CharPack>(file));
    const rec = pack.chars.find((x) => x.c === c);
    if (rec) return { rec, key: keys[j] };
  }
  return undefined;
}

/** Dữ liệu nét chữ (hanzi-writer-data) hoặc undefined nếu không có. */
export async function loadStrokes(c: string): Promise<{ strokes: string[]; medians: number[][][]; radStrokes?: number[] } | undefined> {
  return once(`strokes:${c}`, async () => {
    const res = await fetch(strokeUrl(c));
    return res.ok ? res.json() : undefined;
  });
}

export function loadSearchRows(key: PackKey): Promise<SearchPack['rows']> {
  return once(`search:${key}`, async () => {
    const m = await loadManifest();
    const packs = await Promise.all(m.search[key].files.map((f) => getJson<SearchPack>(f)));
    return packs.flatMap((p) => p.rows);
  });
}

/** Các mục từ điển mở rộng (CVDICT) bắt đầu bằng `text`. */
export async function lookupDict(text: string): Promise<DictEntry[]> {
  if (!text) return [];
  const m = await loadManifest();
  const shard = dictShardOf(text);
  const file = m.dict.files[shard];
  if (!file) return [];
  const data = await once(`dict:${shard}`, () => getJson<DictShard>(m.dict.dir + file));
  return data.entries.filter((e) => e[0].startsWith(text));
}

/** Dòng tìm kiếm của mọi cấp (trang Đọc: tách từ văn bản tự dán). */
export function loadAllSearchRows(): Promise<SearchPack['rows']> {
  return once('search:all', async () => {
    const m = await loadManifest();
    const keys = Object.keys(m.search) as PackKey[];
    return (await Promise.all(keys.map((k) => loadSearchRows(k)))).flat();
  });
}

/** Mục từ điển mở rộng bắt đầu bằng một trong các chữ (tải các tệp cần, mỗi tệp một lần). */
export async function loadDictStarting(chars: readonly string[]): Promise<DictEntry[]> {
  if (!chars.length) return [];
  const m = await loadManifest();
  const byShard = new Map<string, string[]>();
  for (const c of chars) byShard.set(dictShardOf(c), [...(byShard.get(dictShardOf(c)) ?? []), c]);
  const out: DictEntry[] = [];
  await Promise.all(
    [...byShard].map(async ([shard, cs]) => {
      const file = m.dict.files[shard];
      if (!file) return;
      const data = await once(`dict:${shard}`, () => getJson<DictShard>(m.dict.dir + file));
      for (const e of data.entries) if (cs.some((c) => e[0].startsWith(c))) out.push(e);
    }),
  );
  return out;
}

/** 214 bộ Khang Hy. */
export function loadRadicals(): Promise<RadicalsPack> {
  return once('radicals', async () => getJson<RadicalsPack>((await loadManifest()).radicals));
}

/** Ghi chú phát âm cho người Việt (bảng pinyin). */
export function loadPinyinNotes(): Promise<PinyinNotesPack> {
  return once('pinyin-notes', async () => getJson<PinyinNotesPack>((await loadManifest()).pinyinNotes));
}

/** Chỉ mục âm thanh người thật (audio-cmn): âm tiết có sẵn, từ có bản ghi. */
export function loadAudioIndex(): Promise<AudioIndex> {
  return once('audio', async () => getJson<AudioIndex>((await loadManifest()).audio));
}

/** URL bản ghi âm tiết (giọng Chen Wang), ví dụ "ma3"; undefined nếu không có. */
export async function syllableAudioUrl(key: string): Promise<string | undefined> {
  const a = await loadAudioIndex();
  return syllableSet(a).has(key) ? dataUrl(`${a.s.dir}${key}.mp3`) : undefined;
}

/** URL bản ghi của một từ (giọng Yue Tan); undefined nếu không có. */
export async function wordAudioUrl(wordId: string): Promise<string | undefined> {
  const a = await loadAudioIndex();
  const f = a.w.ids[wordId];
  return f ? dataUrl(`${a.w.dir}${f}.mp3`) : undefined;
}

const sylSets = new WeakMap<AudioIndex, Set<string>>();
export function syllableSet(a: AudioIndex): Set<string> {
  let s = sylSets.get(a);
  if (!s) sylSets.set(a, (s = new Set(a.s.keys)));
  return s;
}
