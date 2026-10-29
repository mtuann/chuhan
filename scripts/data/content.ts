/**
 * Nội dung tự soạn trong content/ (CC BY-SA 4.0): ghi chú phát âm của bảng âm (pinyin.yaml). Các tệp *-fixes.yaml là
 * bản sửa lỗi dữ liệu nguồn (fixes.ts), tên gọi khác của bộ thủ ở radicals.yaml (radicals.ts).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { SYLLABLES } from '../../src/lib/pinyin.ts';
import { DATA_VERSION, PinyinNotesPack } from '../../src/schema/data.ts';

export const CONTENT_DIR = 'content';

export async function listContentFiles(dir = CONTENT_DIR): Promise<string[]> {
  return (await readdir(dir)).map((f) => path.join(dir, f)).sort();
}

export async function loadPinyinNotes(): Promise<{ pack: PinyinNotesPack; errors: string[] }> {
  const errors: string[] = [];
  const raw = parse(await readFile(path.join(CONTENT_DIR, 'pinyin.yaml'), 'utf8')) as Record<string, unknown>;
  const pack = PinyinNotesPack.parse({ v: DATA_VERSION, ...raw });
  const ids = new Set<string>();
  for (const n of pack.notes) {
    if (ids.has(n.id)) errors.push(`pinyin.yaml: trùng id ${n.id}`);
    ids.add(n.id);
    for (const k of n.pairs.flat()) if (!SYLLABLES.has(k.slice(0, -1))) errors.push(`pinyin.yaml (${n.id}): "${k}" không phải âm tiết pinyin`);
  }
  return { pack, errors };
}
