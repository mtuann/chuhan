/**
 * Ghi đè sửa lỗi dữ liệu theo từng từ/mục (content/hanviet-fixes.yaml, content/gloss-fixes.yaml,
 * content/pinyin-fixes.yaml).
 * Vì sao cần: một số nguồn thứ ba ghim commit (bảng Hán Việt, CVDICT máy dịch, đề cương HSK 2025)
 * có lỗi không sửa được ở nguồn; ghi đè có kiểm tra hồi quy trong validate.ts để lỗi không
 * tái diễn khi update nguồn. Chạy sau mọi nguồn và sau overlays nội dung để bản sửa luôn thắng.
 * Riêng pinyin-fixes.yaml áp dụng TRƯỚC khi sinh wordId (trong WordSet.add2025, build.ts),
 * vì wordId được sinh từ pinyin.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { WordRec } from '../../src/schema/data.ts';
import { CONTENT_DIR } from './content.ts';
import type { Issues } from './build.ts';

const HanvietFixes = z.record(z.string().min(1), z.array(z.string().min(1)).min(1));
const GlossFix = z
  .object({
    vi: z.array(z.string().min(1)).min(1).optional(),
    drop: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict()
  .refine((g) => g.vi !== undefined || g.drop !== undefined, { message: 'cần khóa vi hoặc drop' });
const GlossFixes = z.record(z.string().min(1), GlossFix);
/** chữ Hán → pinyin dạng dấu đúng (ghi đè pinyin sai của nguồn đề cương, dùng để sinh wordId) */
const PinyinFixes = z.record(z.string().min(1), z.string().min(1));

export interface DataFixes {
  /** id từ → mảng âm Hán Việt từng chữ */
  hanviet: Record<string, string[]>;
  /** chữ → sửa nghĩa (áp cho cả từ HSK và mục từ điển mở rộng) */
  gloss: Record<string, z.infer<typeof GlossFix>>;
  /** chữ Hán → pinyin dạng dấu đúng (áp trước khi sinh wordId); optional để tương thích
   *  ngược với code/test cũ chỉ dùng hanviet/gloss */
  pinyin?: Record<string, string>;
}

export async function loadDataFixes(): Promise<DataFixes> {
  const read = async (f: string): Promise<unknown> => {
    const p = path.join(CONTENT_DIR, f);
    if (!existsSync(p)) return undefined;
    return parseYaml(await readFile(p, 'utf8'));
  };
  return {
    hanviet: HanvietFixes.parse((await read('hanviet-fixes.yaml')) ?? {}),
    gloss: GlossFixes.parse((await read('gloss-fixes.yaml')) ?? {}),
    pinyin: PinyinFixes.parse((await read('pinyin-fixes.yaml')) ?? {}),
  };
}

/** Áp ghi đè lên bản ghi từ đã dựng xong. Sai số chữ → error (dừng pipeline). */
export function applyDataFixes(words: WordRec[], fixes: DataFixes, issues: Issues): void {
  const byId = new Map(words.map((w) => [w.id, w]));
  const byString = new Map<string, WordRec[]>();
  for (const w of words) byString.set(w.s, [...(byString.get(w.s) ?? []), w]);
  for (const [id, hv] of Object.entries(fixes.hanviet)) {
    const w = byId.get(id);
    if (!w) {
      issues.add('warn:fix-hanviet-khong-thay-tu', id);
      continue;
    }
    const n = [...w.s].length;
    if (hv.length !== n) {
      issues.add('error:fix-hanviet-sai-so-chu', `${id}: ${hv.length} âm cho ${n} chữ`);
      continue;
    }
    w.hv = hv.map((h) => [h]);
    delete w.hva;
  }
  for (const [s, g] of Object.entries(fixes.gloss)) {
    const targets = byString.get(s) ?? [];
    if (!targets.length) issues.add('warn:fix-gloss-khong-thay-tu-hsk', `${s} (vẫn áp cho từ điển mở rộng)`);
    const drop = g.drop;
    for (const w of targets) {
      if (drop) {
        if (w.vi) w.vi = w.vi.filter((x) => !drop.includes(x));
      }
      if (g.vi) w.vi = [...g.vi];
    }
  }
}
