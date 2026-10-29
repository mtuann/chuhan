/**
 * `useLiveQuery` thay thế `dexie-react-hooks` (gói này không còn được import ở đâu nữa).
 *
 * Semantics giữ nguyên bản gốc (đối chiếu `node_modules/dexie-react-hooks/src/useObservable.ts`):
 * - `defaultResult` hiển thị cho tới emission đầu tiên; resubscribe khi `deps` đổi (giữ giá trị cũ
 *   cho tới khi có giá trị mới); lỗi của querier được throw lúc render để ErrorBoundary bắt;
 *   chỉ re-render khi identity giá trị đổi (`!==`).
 * - Querier mới nhất luôn được dùng (qua ref), không resubscribe khi closure đổi.
 *
 * KHÁC BIỆT DUY NHẤT so với dexie-react-hooks: querier nhận instance DB — `(db) => ...` — vì `db()`
 * giờ là async. `await import('dexie')` chỉ chạy khi component đầu tiên subscribe (tức lần chạm DB đầu
 * tiên trên trang đó); trang không subscribe thì không tải Dexie.
 *
 * RÀNG BUỘC QUAN TRỌNG (đã kiểm chứng bằng thực nghiệm): querier phải là hàm thuần Dexie ĐỒNG BỘ
 * trên instance nhận được — ví dụ `(t) => t.cards.where('kind').equals('read').toArray()`. Dexie chỉ theo
 * dõi được các bảng khi thao tác DB được khởi tạo đồng bộ trong lúc liveQuery chạy querier; nếu
 * querier `await` một promise lạ (kể cả `await db()`) trước khi chạm DB, query sẽ KHÔNG tự cập nhật
 * khi dữ liệu đổi (stale). Vì vậy KHÔNG viết `(t) => db().then(...)` hay `async (t) => { await x; ... }`
 * ở đây — `await db()` đã được hook này lo bên ngoài querier.
 */
import { useEffect, useReducer, useRef, type DependencyList } from 'react';
import { db, type AppDB } from './db';

/** Querier cho useLiveQuery: nhận instance DB đã mở, trả về giá trị hoặc promise giá trị. */
export type LiveQuerier<T> = (db: AppDB) => T | Promise<T>;

interface Subscription {
  unsubscribe(): void;
}

/**
 * Chữ ký số (cyrb53) của một mảng theo các trường trích từ từng phần tử — để `useMemo` chỉ tính lại
 * khi nội dung đổi thật, tránh identity churn từ liveQuery (mảng mới mỗi lần bảng đổi, kể cả khi đổi
 * ở trường không ai đọc). O(n) mỗi lần query emit, không cấp phát chuỗi lớn.
 */
export function arraySig<T>(rows: readonly T[] | null | undefined, fields: (r: T) => (string | number | boolean | undefined)[]): number {
  if (!rows) return 0;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const mix = (v: number) => {
    h1 = Math.imul(h1 ^ v, 2654435761);
    h2 = Math.imul(h2 ^ v, 1597334677);
  };
  mix(rows.length);
  for (const r of rows) {
    for (const f of fields(r)) {
      const s = String(f);
      for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
      mix(0x9e3779b9);
    }
  }
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function useLiveQuery<T>(querier: LiveQuerier<T>, deps?: DependencyList): T | undefined;
export function useLiveQuery<T, TDefault>(
  querier: LiveQuerier<T>,
  deps: DependencyList | undefined,
  defaultResult: TDefault,
): T | TDefault;
export function useLiveQuery<T, TDefault>(
  querier: LiveQuerier<T>,
  deps?: DependencyList,
  defaultResult?: TDefault,
): T | TDefault | undefined {
  const monitor = useRef<{ hasResult: boolean; result: T | TDefault | undefined; error: unknown }>({
    hasResult: false,
    result: defaultResult,
    error: null,
  });
  // Querier mới nhất (closure mới nhất); resubscribe chỉ khi `deps` đổi — như bản gốc.
  const querierRef = useRef(querier);
  querierRef.current = querier;
  const [, triggerUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    let alive = true;
    let sub: Subscription | null = null;
    const onNext = (val: T) => {
      const m = monitor.current;
      if (m.error !== null || m.result !== (val as unknown as T | TDefault | undefined)) {
        m.error = null;
        m.result = val as unknown as T | TDefault | undefined;
        m.hasResult = true;
        if (alive) triggerUpdate();
      }
    };
    const onError = (err: unknown) => {
      const m = monitor.current;
      if (m.error !== err) {
        m.error = err;
        if (alive) triggerUpdate();
      }
    };
    // Chạm DB lần đầu ở đây: nạp Dexie lười, rồi subscribe liveQuery với querier thuần đồng bộ
    // trên instance đã mở — Dexie theo dõi bảng bình thường (không stale).
    db()
      .then(async (t) => {
        const { liveQuery } = await import('dexie');
        if (!alive) return;
        const q = querierRef.current;
        sub = liveQuery(() => q(t)).subscribe(onNext, onError);
      })
      .catch(onError);
    return () => {
      alive = false;
      sub?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ?? []);

  // Ném lỗi lúc render để ErrorBoundary bắt — như bản gốc.
  if (monitor.current.error) throw monitor.current.error;
  return monitor.current.result;
}
