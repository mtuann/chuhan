/**
 * Phía trang của Tra từ: một Web Worker dùng chung cho cả trang, gọi theo kiểu promise.
 */
import type { DictEntry } from '../schema/data';
import type { BriefEntry, SearchResult, WorkerRequest, WorkerResponse } from './search-protocol';

type Progress = Extract<WorkerResponse, { type: 'progress' }>;
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
// Phân phối theo kiểu Omit cho từng nhánh của union.
type Req = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, 'id'> : never) : never;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const listeners = new Set<(p: Progress) => void>();
let lastProgress: Progress | null = null;

function get(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'progress') {
      lastProgress = msg;
      for (const l of listeners) l(msg);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  });
  return worker;
}

function call<T>(req: Req): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    get().postMessage({ ...req, id } as WorkerRequest);
  });
}

export const searchWords = (q: string, limit = 50) => call<SearchResult>({ type: 'search', q, limit });
/** Các từ có đúng chuỗi giản thể `s`; `all` = chờ tải đủ mọi cấp (để không sót từ đồng tự khác âm). */
export const resolveWord = (s: string, all = false) => call<BriefEntry[]>({ type: 'resolve', s, all });
export const wordsContaining = (c: string, n = 3) => call<BriefEntry[]>({ type: 'containing', c, n });
export const lookupExtended = (q: string, limit = 30) => call<DictEntry[]>({ type: 'dict', q, limit });

export function onSearchProgress(cb: (p: Progress) => void): () => void {
  listeners.add(cb);
  if (lastProgress) cb(lastProgress);
  get();
  return () => listeners.delete(cb);
}
