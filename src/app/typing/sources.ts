/**
 * Đề luyện gõ: từ theo cấp (hoặc từ đang học, chữ hay gõ sai), bộ từ cùng âm dễ chọn nhầm, từ cho thử thách tốc độ.
 * Lấy từ dữ liệu từ điển sẵn có.
 */
import type { PackKey, Token } from '../../schema/data';
import { loadAllSearchRows, loadSearchRows } from '../../lib/data';
import { db } from '../../lib/db';
import { shortMeaning } from '../../lib/ime';
import { homophoneSets, sylOfId, type HomoMember, type TargetChar } from '../../lib/typing';

/** Một đề gõ. */
export interface DrillItem {
  key: string;
  /** chữ cần gõ (kèm dấu câu, để hiện) */
  zh: string;
  target: TargetChar[];
  /** pinyin có dấu */
  p: string;
  /** pinyin không dấu, cách nhau theo từ (cách gõ): "wo zai xuexiao" */
  keys: string;
  /** nghĩa (từ) hoặc bản dịch (câu) */
  vi: string;
  hv?: string;
  /** token của câu (hiện chữ, pinyin từng từ, chỗ trống) */
  tk?: Token[];
  /** câu chứa chỗ trống (bẫy cùng âm): vị trí token cần gõ */
  blank?: number;
  /** bộ từ cùng âm của chỗ trống */
  set?: HomoMember[];
  /** id từ (nghe bản ghi người thật) */
  wordId?: string;
  /** chỗ trống là một dấu câu (Bẫy dấu câu) */
  punct?: true;
}

const isHan = (c: string) => /\p{Script=Han}/u.test(c);
type Row = Awaited<ReturnType<typeof loadAllSearchRows>>[number];

/** Lấy ngẫu nhiên n phần tử khác nhau. */
export function sample<T>(xs: readonly T[], n: number, rng: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}


function wordItem(r: Row): DrillItem | null {
  const [id, , p, hv, vi] = r;
  const t = id.slice(0, id.indexOf('_'));
  const chars = [...t];
  if (!chars.every(isHan)) return null;
  const syl = sylOfId(id);
  if (syl.length !== chars.length) return null;
  return {
    key: id,
    zh: t,
    target: chars.map((c, k) => ({ c, syl: syl[k] })),
    p,
    keys: syl.join(''),
    vi: shortMeaning(vi, 40),
    hv,
    wordId: id,
  };
}

let rowsP: Promise<Row[]> | null = null;
/** Toàn bộ các cấp (chỉ dùng khi nguồn từ trải nhiều cấp, ví dụ từ đang học). */
const rows = () => (rowsP ??= loadAllSearchRows().catch((e: unknown) => {
  rowsP = null;
  throw e;
}));

/** Hàng tìm kiếm của đúng các cấp cho trước: loadSearchRows memo theo cấp nên chỉ tải file của các cấp cần. */
const rowsOf = (levels: readonly number[]): Promise<Row[]> =>
  Promise.all(levels.map((l) => loadSearchRows(String(l) as PackKey))).then((packs) => packs.flat());
const rowsUpTo = (level: number): Promise<Row[]> => rowsOf(Array.from({ length: level }, (_, k) => k + 1));

/** Nguồn từ: một cấp HSK, từ đang học (Từ của tôi), hoặc từ chứa chữ hay gõ sai. */
export type WordSource = { kind: 'cap'; level: number } | { kind: 'hoc' } | { kind: 'loi'; chars: string[] };

export async function wordItems(src: WordSource, n = 10): Promise<DrillItem[]> {
  // nguồn theo 1 cấp: chỉ tải search index của đúng cấp đó; 'loi' chỉ cần cấp 1–7; 'hoc' (trải nhiều cấp) mới cần toàn bộ
  const all = src.kind === 'cap' ? await rowsOf([src.level]) : src.kind === 'loi' ? await rowsUpTo(7) : await rows();
  let pool: Row[];
  if (src.kind === 'cap') pool = all.filter((r) => r[1] === src.level);
  else if (src.kind === 'hoc') {
    const ids = new Set((await (await db()).words.where('st').equals('hoc').primaryKeys()) as string[]);
    pool = all.filter((r) => ids.has(r[0]));
  } else {
    const chars = new Set(src.chars);
    // từ các cấp chứa chữ hay sai: ưu tiên từ ngắn, hay gặp
    pool = all
      .filter((r) => r[1] >= 1 && r[1] <= 7 && [...r[0].slice(0, r[0].indexOf('_'))].some((c) => chars.has(c)))
      .sort((a, b) => (a[6] ?? 30000) - (b[6] ?? 30000))
      .slice(0, 40);
  }
  return sample(pool, n)
    .map(wordItem)
    .filter((x): x is DrillItem => !!x);
}

/**
 * Bẫy cùng âm: mỗi đề một từ thuộc bộ từ gõ cùng pinyin (在/再, 买/卖, 的/得/地…). Đề cho pinyin, âm Hán Việt và
 * nghĩa; người học gõ và chọn đúng chữ trong danh sách gợi ý. Mỗi bộ một đề.
 */
export async function homophoneItems(level: number, n = 8): Promise<DrillItem[]> {
  // homophoneSets chỉ dùng các cấp ≤ level nên không cần tải search index các cấp trên
  const sets = homophoneSets(await rowsUpTo(level), level).slice(0, 60);
  return sample(sets, n).map((set) => {
    const m = sample(set, 1)[0];
    const syl = sylOfId(m.id);
    return {
      key: m.id,
      zh: m.t,
      target: [...m.t].map((c, k) => ({ c, syl: syl[k] })),
      p: m.p,
      keys: syl.join(''),
      vi: `${m.hv ? `${m.hv} · ` : ''}${m.m}`,
      set,
      wordId: m.id,
    };
  });
}

/** Tên riêng có trong các câu ([chữ, pinyin]) để bộ gõ gợi ý được. */
export function namesOf(tks: readonly (readonly Token[])[]): [string, string][] {
  const out = new Map<string, string>();
  for (const tk of tks) for (const t of tk) if (t.length === 2) out.set(t[0], t[1]);
  return [...out.entries()];
}

/** Từ để chạy thử thách tốc độ: từ cấp ≤ level, hay gặp trước. */
export async function speedWords(level: number): Promise<DrillItem[]> {
  const all = await rowsUpTo(level);
  const pool = all.filter((r) => r[1] >= 1 && r[1] <= level).sort((a, b) => (a[6] ?? 30000) - (b[6] ?? 30000));
  return sample(pool.slice(0, 600), 200)
    .map(wordItem)
    .filter((x): x is DrillItem => !!x);
}
