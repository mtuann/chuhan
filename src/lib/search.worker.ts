/**
 * Web Worker của Tra từ: tải dần các gói tìm kiếm theo cấp (1 → 7–9 → ngoài HSK), dựng chỉ mục và trả lời truy vấn.
 * Gói tải về được service worker lưu cache, lần sau mở nhanh và chạy offline.
 */
import type { PackKey, SearchPack } from '../schema/data';
import { getJson, loadManifest, lookupDict } from './data';
import { SearchIndex, type Entry } from './search-core';
import type { WorkerRequest, WorkerResponse } from './search-protocol';

const ORDER: PackKey[] = ['1', '2', '3', '4', '5', '6', '7', 'x'];
const idx = new SearchIndex();

type Deferred = { p: Promise<void>; resolve: () => void; reject: (e: unknown) => void };
function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  p.catch(() => undefined); // tránh "unhandled rejection" khi chưa ai chờ
  return { p, resolve, reject };
}

/** levelDone[i] xong khi đã tải cấp ORDER[i]. */
let levelDone: Deferred[] = ORDER.map(() => deferred());
let loaded = 0;
let target = 0;
let running = false;

const post = (msg: WorkerResponse) => postMessage(msg);

async function run() {
  if (running) return;
  running = true;
  try {
    const m = await loadManifest();
    while (loaded < target) {
      for (const f of m.search[ORDER[loaded]].files) idx.add((await getJson<SearchPack>(f)).rows);
      levelDone[loaded].resolve();
      loaded++;
      post({ type: 'progress', loaded, total: ORDER.length, words: idx.size });
    }
  } catch (err) {
    // Lỗi mạng (offline, chưa có cache): báo cho mọi yêu cầu đang chờ; lần gọi sau sẽ thử lại.
    for (let i = loaded; i < ORDER.length; i++) {
      const d = levelDone[i];
      levelDone[i] = deferred();
      d.reject(err);
    }
    target = loaded;
  } finally {
    running = false;
    if (loaded < target) void run();
  }
}

/** Tải tới khi đủ `n` cấp đầu theo thứ tự ORDER. */
function ensure(n: number): Promise<void> {
  const k = Math.min(n, ORDER.length);
  if (k <= loaded) return Promise.resolve();
  target = Math.max(target, k);
  void run();
  return levelDone[k - 1].p;
}

/** Tải dần từng cấp cho tới khi `done()` đúng hoặc đã tải hết. */
async function until(done: () => boolean): Promise<void> {
  for (let n = Math.max(loaded, 1); n <= ORDER.length; n++) {
    await ensure(n);
    if (done()) return;
  }
}

const brief = (e: Entry) => ({ id: e.id, s: e.s, lv: e.lv, p: e.p, hv: e.hv, vi: e.vi });

addEventListener('message', async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case 'search': {
        await ensure(1);
        ensure(ORDER.length).catch(() => undefined); // tải tiếp phần còn lại khi rảnh
        post({ type: 'result', id: req.id, ok: true, result: { hits: idx.search(req.q, req.limit ?? 50), ready: loaded === ORDER.length } });
        break;
      }
      case 'resolve': {
        if (req.all) await ensure(ORDER.length);
        else await until(() => idx.resolve(req.s).length > 0);
        post({ type: 'result', id: req.id, ok: true, result: idx.resolve(req.s).map(brief) });
        break;
      }
      case 'containing': {
        try {
          await until(() => idx.containing(req.c, req.n).length >= req.n);
        } catch (err) {
          // mất mạng giữa chừng: có từ nào trong các cấp đã tải thì vẫn trả về
          if (!idx.containing(req.c, 1).length) throw err;
        }
        post({ type: 'result', id: req.id, ok: true, result: idx.containing(req.c, req.n).map(brief) });
        break;
      }
      case 'dict': {
        const entries = await lookupDict(req.q);
        post({ type: 'result', id: req.id, ok: true, result: entries.slice(0, req.limit ?? 30) });
        break;
      }
    }
  } catch (err) {
    post({ type: 'result', id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
