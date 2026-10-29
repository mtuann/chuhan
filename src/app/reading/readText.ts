/**
 * Tách từ một đoạn văn bản tự dán (Đọc · Dán văn bản, Gõ theo đoạn văn): từ điển HSK tải một lần cho cả phiên, từ điển
 * mở rộng tải theo chữ cần. Chạy trên máy, văn bản không gửi đi đâu.
 */
import { loadAllSearchRows, loadDictStarting } from '../../lib/data';
import { addDict, buildHsk, dictNeeds, segment, type DictWord, type HskEntry, type ReadTok } from '../../lib/reader';

let hskPromise: Promise<Map<string, HskEntry[]>> | null = null;
/** Từ HSK theo chuỗi chữ (dựng một lần). */
export const loadHsk = () =>
  (hskPromise ??= loadAllSearchRows()
    .then((rows) => buildHsk(rows))
    .catch((e: unknown) => {
      hskPromise = null;
      throw e;
    }));
const dictCache = new Map<string, DictWord[]>();
const dictLoaded = new Set<string>();

/** Tách từ, ghi pinyin cho cả đoạn. */
export async function readText(text: string): Promise<ReadTok[]> {
  const hsk = await loadHsk();
  const need = dictNeeds(text, hsk).filter((c) => !dictLoaded.has(c));
  if (need.length) {
    addDict(dictCache, await loadDictStarting(need));
    for (const c of need) dictLoaded.add(c);
  }
  return segment(text, { hsk, dict: dictCache });
}
