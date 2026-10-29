/**
 * Tìm từ với cấp có thể sai (src/lib/data.ts: loadWordFallback),
 * rút từ `loadData` trong src/app/srs/ReviewSession.tsx.
 * Giả lập fetch: manifest + hai gói từ (gói 1 có 好, gói 2 có 你).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const manifest = {
  words: {
    '1': { files: ['words/1/a.json'], first: ['好_hao3'] },
    '2': { files: ['words/2/a.json'], first: ['你_ni3'] },
    x: { files: [], first: [] },
  },
};
const packs: Record<string, unknown> = {
  'words/1/a.json': { words: [{ id: '好_hao3', s: '好' }] },
  'words/2/a.json': { words: [{ id: '你_ni3', s: '你' }] },
};

async function fresh() {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    (async (input: unknown) => {
      const u = String(input);
      const body = u.includes('manifest.json') ? manifest : packs[Object.keys(packs).find((k) => u.includes(k))!];
      return { ok: true, json: async () => body };
    }) as unknown as typeof fetch,
  );
  return import('../../src/lib/data');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('loadWordFallback', () => {
  it('cấp đúng: tìm thấy ngay trong gói đó', async () => {
    const { loadWordFallback } = await fresh();
    const w = await loadWordFallback('好_hao3', 1);
    expect(w?.id).toBe('好_hao3');
  });

  it('cấp lưu trên thẻ sai (từ thêm khi đọc): tìm trong mọi gói', async () => {
    const { loadWordFallback } = await fresh();
    const w = await loadWordFallback('你_ni3', 1);
    expect(w?.id).toBe('你_ni3');
  });

  it('không có cấp: tìm trong mọi gói', async () => {
    const { loadWordFallback } = await fresh();
    const w = await loadWordFallback('你_ni3');
    expect(w?.id).toBe('你_ni3');
  });

  it('không có từ nào: undefined', async () => {
    const { loadWordFallback } = await fresh();
    expect(await loadWordFallback('不存在_bu4cun2zai4', 1)).toBeUndefined();
  });
});
