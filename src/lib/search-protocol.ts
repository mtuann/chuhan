/** Thông điệp giữa trang và Web Worker của Tra từ. */
import type { DictEntry } from '../schema/data';
import type { Hit } from './search-core';

export type WorkerRequest =
  | { type: 'search'; id: number; q: string; limit?: number }
  | { type: 'resolve'; id: number; s: string; all?: boolean }
  | { type: 'containing'; id: number; c: string; n: number }
  | { type: 'dict'; id: number; q: string; limit?: number };

/** Mục rút gọn trả về cho trang từ/trang chữ. */
export interface BriefEntry {
  id: string;
  s: string;
  lv: number;
  p: string;
  hv: string;
  vi: string;
}

export interface SearchResult {
  hits: Hit[];
  /** đã tải đủ mọi cấp chưa */
  ready: boolean;
}

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number; words: number }
  | { type: 'result'; id: number; ok: true; result: SearchResult | BriefEntry[] | DictEntry[] }
  | { type: 'result'; id: number; ok: false; error: string };
